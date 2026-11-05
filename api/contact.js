// Vercel serverless function: POST /api/contact
// Sends contact-form enquiries by email through Resend (https://resend.com).
//
// Required environment variables (Vercel > Project > Settings > Environment Variables):
//   RESEND_API_KEY      your Resend API key
//   CONTACT_TO_EMAIL    where enquiries go (comma-separate for several addresses)
// Optional:
//   CONTACT_FROM_EMAIL  verified sender, e.g. "Bethany Gonyea Website <hello@bethanygonyea.com>"
//                       (defaults to Resend's test sender, which only delivers to your own Resend account email)

const hits = new Map(); // best-effort rate limit per warm instance
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const INTERESTS = new Set([
  'Private biofeedback or EEG session',
  'Consciousness Athlete training',
  'Speaking or workshop',
  'Resonant Peaceful Cities Project',
  'Book launch list: Surrendered Is The New Powerful',
  'Media or interview',
  'Something else',
]);

const clean = (v, max) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s) => s.replace(/[\r\n]+/g, ' ');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Honeypot: real visitors never fill this in
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });

  const name = oneLine(clean(body.name, 120));
  const email = oneLine(clean(body.email, 200));
  const phone = oneLine(clean(body.phone, 40));
  const interestRaw = oneLine(clean(body.interest, 120));
  const interest = INTERESTS.has(interestRaw) ? interestRaw : 'Something else';
  const message = clean(body.message, 5000);

  if (!name || !message) {
    return res.status(400).json({ ok: false, error: 'Please include your name and a message.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ ok: false, error: 'Too many messages in a short time.' });
  }
  recent.push(now);
  hits.set(ip, recent);

  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.CONTACT_TO_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  const from = process.env.CONTACT_FROM_EMAIL || 'Bethany Gonyea Website <onboarding@resend.dev>';

  if (!apiKey || !to.length) {
    console.error('Contact form is not configured: set RESEND_API_KEY and CONTACT_TO_EMAIL.');
    return res.status(500).json({ ok: false, error: 'The contact form is not connected yet.' });
  }

  const text = [
    `New enquiry from bethanygonyea.com`,
    ``,
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || 'Not given'}`,
    `Interested in: ${interest}`,
    ``,
    `Message:`,
    message,
  ].join('\n');

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:28px;background:#0a0820;color:#f1eadc;border-radius:16px">
    <p style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#e2c27d;margin:0 0 8px">New website enquiry</p>
    <h1 style="font-weight:400;font-size:26px;margin:0 0 20px">${esc(interest)}</h1>
    <table style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#f1eadc;border-collapse:collapse;width:100%">
      <tr><td style="color:#e2c27d;padding:4px 12px 4px 0;width:110px">Name</td><td>${esc(name)}</td></tr>
      <tr><td style="color:#e2c27d;padding:4px 12px 4px 0">Email</td><td><a style="color:#f6e3b0" href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
      <tr><td style="color:#e2c27d;padding:4px 12px 4px 0">Phone</td><td>${esc(phone || 'Not given')}</td></tr>
    </table>
    <div style="margin-top:20px;padding:18px;border-radius:12px;background:#17123d;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(message)}</div>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#9a93b8;margin:18px 0 0">Reply to this email to answer ${esc(name.split(' ')[0])} directly.</p>
  </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        reply_to: email,
        subject: `Website enquiry: ${interest} from ${name}`,
        text,
        html,
      }),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'Your message could not be delivered.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact send failed', err);
    return res.status(502).json({ ok: false, error: 'Your message could not be delivered.' });
  }
};
