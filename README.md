# bethanygonyea.com

One-page website for Bethany Ann Gonyea, MS. Plain HTML, CSS and JavaScript (no build step), plus one Vercel serverless function for the contact form.

## What's in this folder

| Path | What it is |
| --- | --- |
| `index.html` | The whole page: copy, structure, SEO tags |
| `assets/css/style.css` | Design system and layout |
| `assets/js/main.js` | Animations and interactions (hero waves, Mind Mirror, breathing orb, globe, form) |
| `assets/img/` | Optimised WebP images used by the site |
| `api/contact.js` | Contact form backend (sends email through Resend) |
| `favicon.svg`, `apple-touch-icon.png`, `og-image.jpg` | Icons and the social-share image |
| `vercel.json` | Caching and security headers |
| `hd-images/` | Sharpened full-resolution photos for print or social use (not deployed) |

## Deploy to Vercel

1. Go to vercel.com > **Add New > Project**, and import this folder (via GitHub, or with the CLI: run `npx vercel` inside this folder).
2. Framework preset: **Other**. Leave the build command empty and the output directory as the project root.
3. Deploy, then add the domain under **Settings > Domains**.

## Connect the contact form (required for messages to arrive)

1. Create a free account at resend.com and verify the sending domain (e.g. `bethanygonyea.com`).
2. In Vercel, open **Settings > Environment Variables** and add:
   - `RESEND_API_KEY`: the Resend API key
   - `CONTACT_TO_EMAIL`: the inbox that should receive enquiries (comma-separate several)
   - `CONTACT_FROM_EMAIL`: a sender on the verified domain, e.g. `Bethany Gonyea Website <hello@bethanygonyea.com>`
3. Redeploy. Replies go straight to the visitor, because each email's reply-to is set to their address.

Until these are set, the form shows the visitor a polite "not connected yet" message.

## Replace before launch

- **Book links**: *Become A Consciousness Athlete* now links straight to its Amazon page (taken from numinousonline.org). Its Audible button and the *Dealing With Difficult People* Amazon button still open search results; swap in the direct product URLs (search `REPLACE` in `index.html`).
- **NUMINOUS links**: the NUMINOUS section links only to numinousonline.org pages, plus its sign-up form and Givebutter donation page. Some links on numinousonline.org itself point to a temporary domain (`gkq.qbf.temporary.site`), which is worth fixing on that site.
- **Calendly**: the "Book a 15-min call" buttons (4 places) use `https://calendly.com/bethany-gonyea/15-phone-consult-with-bethany`, taken from numinousonline.org. To change it, find-and-replace that URL in `index.html`.
- **YouTube**: the "Consciousness Athletes" links open a YouTube search. Swap in the channel URL.
- **LinkedIn**: no URL was provided, so there is no LinkedIn link yet. Add one to the footer's "Elsewhere" list.
- **Domain**: canonical, Open Graph, `robots.txt` and `sitemap.xml` use `https://bethanygonyea.com`. Change them if the live domain is spelled differently.
