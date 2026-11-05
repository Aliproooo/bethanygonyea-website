/* =========================================================
   Bethany Gonyea, MS | interactions & generative visuals
   No dependencies. Every canvas pauses when off-screen.
   ========================================================= */
(() => {
  'use strict';
  window.__bgReady = true;

  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const TAU = Math.PI * 2;

  // Deterministic random so visuals look the same on every visit
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ---------- Canvas helpers ---------- */
  function setupCanvas(canvas, onResize) {
    const ctx = canvas.getContext('2d');
    const state = { ctx, w: 0, h: 0, dpr: 1 };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.w = Math.max(1, r.width);
      state.h = Math.max(1, r.height);
      canvas.width = Math.round(state.w * state.dpr);
      canvas.height = Math.round(state.h * state.dpr);
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      if (onResize) onResize(state);
    };
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    return state;
  }

  // Runs frame(time, dt) only while `el` is near the viewport
  function runWhenVisible(el, frame) {
    if (reduced) { frame(4, 0); return { still: true }; }
    let raf = 0, last = 0;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      frame(now / 1000, dt);
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
      else if (!entry.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { rootMargin: '120px 0px' });
    io.observe(el);
    return { still: false };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Builds an SVG path for a little EEG-like trace
  function tracePath(width, height, t, comps) {
    let d = '';
    for (let x = 0; x <= width; x += 2) {
      let y = 0;
      for (const [f, a, s] of comps) y += Math.sin(x * f + t * s) * a;
      d += (x ? 'L' : 'M') + x + ' ' + (height / 2 + y * height * 0.42).toFixed(1);
    }
    return d;
  }

  /* =========================================================
     Intro + reveals
     ========================================================= */
  const intro = $('#intro');
  let revealsStarted = false;

  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part, idx) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            // Punctuation glued to a preceding element (e.g. "</em>.") joins that word,
            // so it can never wrap onto a line by itself.
            const prev = child.previousSibling;
            if (idx === 0 && prev && prev.nodeType === 1 && /^[.,!?;:…”’)]+$/.test(part)) {
              const words = prev.querySelectorAll('.split-word > span');
              if (words.length) {
                const p = document.createElement('span');
                p.className = 'split-punct';
                p.textContent = part;
                words[words.length - 1].appendChild(p);
                return;
              }
            }
            const outer = document.createElement('span');
            outer.className = 'split-word';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
  }
  $$('[data-split]').forEach(splitWords);

  function startReveals() {
    if (revealsStarted) return;
    revealsStarted = true;
    const targets = $$('[data-reveal], [data-split], .path');
    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((el) => io.observe(el));
  }

  if (intro && !root.classList.contains('no-intro')) {
    const path = $('#intro-path');
    const t0 = performance.now();
    const DUR = 900;
    const draw = (now) => {
      const t = clamp((now - t0) / DUR);
      const grow = smooth(clamp(t * 1.6));
      let d = '';
      for (let x = 0; x <= 600; x += 5) {
        const u = x / 600;
        const env = Math.sin(Math.PI * u);
        const noise = (Math.sin(x * 0.31 + now * 0.02) + Math.sin(x * 0.13 - now * 0.011) * 0.7 + Math.sin(x * 0.57 + now * 0.03) * 0.4) * (1 - t);
        const sine = Math.sin(u * TAU * 3 - now * 0.005) * t * 1.4;
        d += (x ? 'L' : 'M') + x + ' ' + (60 + env * 34 * grow * (noise * 0.55 + sine)).toFixed(1);
      }
      path.setAttribute('d', d);
      if (!intro.classList.contains('is-done')) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    setTimeout(() => {
      intro.classList.add('is-done');
      try { sessionStorage.setItem('bg-intro', '1'); } catch (e) { /* private mode */ }
      startReveals();
    }, 1150);
  } else {
    startReveals();
  }

  /* =========================================================
     Header, menu, progress, active link
     ========================================================= */
  const header = $('#header');
  const progressBar = $('#scroll-progress');
  const menuBtn = $('#menu-toggle');
  const menu = $('#mobile-menu');

  function setMenu(open) {
    menu.hidden = !open;
    root.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });

  const navLinks = $$('.nav a');
  if ('IntersectionObserver' in window) {
    const sectionIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['story', 'method', 'mind-mirror', 'books', 'peace', 'numinous', 'about'].forEach((id) => {
      const s = document.getElementById(id);
      if (s) sectionIO.observe(s);
    });
  }

  /* =========================================================
     HERO: noise -> coherence wave field
     ========================================================= */
  const heroEl = $('#top');
  const heroCanvas = $('#hero-field');
  const coherenceFill = $('#coherence-fill');
  const coherenceValue = $('#coherence-value');
  const meterHint = $('.hero__meter-hint');
  const miniEeg = $('#mini-eeg');
  let heroC = 0, heroTarget = 0.12;
  const pointer = { x: -9999, y: -9999, active: false };

  if (heroCanvas) {
    const r = rng(7);
    let lines = [], stars = [], grad = null;
    const field = setupCanvas(heroCanvas, (s) => {
      const n = s.w < 700 ? 11 : 17;
      lines = Array.from({ length: n }, (_, i) => ({
        off: i / (n - 1) - 0.5,
        f1: 0.6 + r() * 2.2, f2: 1.8 + r() * 3.4,
        a1: 0.5 + r() * 0.8, a2: 0.2 + r() * 0.5,
        s1: (0.3 + r() * 0.9) * (r() > 0.5 ? 1 : -1), s2: (0.4 + r() * 1.2) * (r() > 0.5 ? 1 : -1),
        p1: r() * TAU, p2: r() * TAU,
      }));
      stars = Array.from({ length: Math.round((s.w * s.h) / 9000) }, () => ({
        x: r() * s.w, y: r() * s.h, z: r() * 1.3 + 0.3, sp: 0.5 + r() * 2, ph: r() * TAU,
      }));
      grad = s.ctx.createLinearGradient(0, 0, s.w, 0);
      grad.addColorStop(0, 'rgba(164,140,255,0)');
      grad.addColorStop(0.18, 'rgba(164,140,255,1)');
      grad.addColorStop(0.55, 'rgba(226,194,125,1)');
      grad.addColorStop(0.85, 'rgba(246,227,176,1)');
      grad.addColorStop(1, 'rgba(246,227,176,0)');
    });

    heroCanvas.parentElement.addEventListener('pointermove', (e) => {
      const rect = heroCanvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left; pointer.y = e.clientY - rect.top; pointer.active = true;
    });
    heroCanvas.parentElement.addEventListener('pointerleave', () => { pointer.active = false; });

    runWhenVisible(heroEl, (rt, dt) => {
      const t = rt * 0.55;
      const { ctx, w, h } = field;
      heroC += (heroTarget - heroC) * Math.min(1, dt * 2.6);
      if (reduced) heroC = 0.75;
      const c = smooth(clamp(heroC));
      ctx.clearRect(0, 0, w, h);

      // stars
      ctx.globalCompositeOperation = 'source-over';
      for (const s of stars) {
        const a = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * s.sp * 0.5 + s.ph));
        ctx.fillStyle = `rgba(246,227,176,${(a * 0.8).toFixed(3)})`;
        ctx.fillRect(s.x, s.y, s.z, s.z);
      }

      // waves
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = grad;
      const mid = h * (w < 900 ? 0.5 : 0.56);
      const step = w < 700 ? 10 : 7;
      const px = pointer.active ? pointer.x : -9999;
      const py = pointer.active ? pointer.y : -9999;
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += step) {
          const u = x / w;
          const env = 0.35 + 0.65 * Math.sin(Math.PI * clamp(u));
          const inc = Math.sin(u * TAU * L.f1 + t * L.s1 + L.p1) * L.a1 + Math.sin(u * TAU * L.f2 + t * L.s2 + L.p2) * L.a2;
          const coh = Math.sin(u * TAU * 1.35 - t * 0.85) * 1.1 + Math.sin(u * TAU * 2.7 - t * 1.7) * 0.12;
          const yInc = L.off * h * 0.62 + inc * h * 0.07;
          const yCoh = L.off * (26 + 10 * Math.sin(t * 0.6)) + coh * h * 0.13;
          let y = mid + lerp(yInc, yCoh, c) * env;
          const dx = x - px, dy = y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200) y += Math.sin(dist * 0.05 - t * 4) * 7 * (1 - dist / 200) * (1 - c * 0.5);
          if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const centerWeight = 1 - Math.abs(L.off) * 1.4;
        ctx.globalAlpha = clamp((0.1 + 0.32 * centerWeight) * (0.65 + c * 0.6), 0.04, 0.6);
        ctx.lineWidth = 1 + c * 0.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // meter UI
      if (coherenceFill) coherenceFill.style.transform = `scaleX(${clamp(heroC).toFixed(3)})`;
      if (coherenceValue) coherenceValue.textContent = Math.round(clamp(heroC) * 100);
      if (meterHint) {
        const done = heroC > 0.93;
        if (meterHint.dataset.done !== String(done)) {
          meterHint.dataset.done = String(done);
          meterHint.textContent = done ? 'Coherent. Keep scrolling' : 'Scroll to bring the waves into coherence';
        }
      }
      if (miniEeg) miniEeg.setAttribute('d', tracePath(120, 32, t * 4, [[0.21, 0.5 - c * 0.35, 1], [0.55, 0.28 * (1 - c), 2.3], [0.09, 0.2 + c * 0.45, 0.6]]));
    });
  }

  /* =========================================================
     Scroll-driven effects (one rAF-throttled handler)
     ========================================================= */
  // Promise: words light up as you scroll
  const promiseText = $('#promise-text');
  let promiseWords = [];
  if (promiseText) {
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = p;
            frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) walk(child);
      });
    };
    walk(promiseText);
    promiseWords = $$('.w', promiseText);
    $$('.w', promiseText).slice(-6).forEach((w) => w.classList.add('gold'));
  }

  // Story chart
  const storyGrid = $('.story__grid');
  const clipRect = $('#chart-clip-rect');
  const painPath = $('.chart__pain');
  const milesPath = $('.chart__miles');
  const painDot = $('#pain-dot');
  const milesDot = $('#miles-dot');
  const painState = $('#pain-state');
  const milesValue = $('#miles-value');
  const sampleByX = (path) => {
    const len = path.getTotalLength();
    const pts = [];
    for (let i = 0; i <= 240; i++) pts.push(path.getPointAtLength((len * i) / 240));
    return (x) => {
      let k = pts.findIndex((p) => p.x >= x);
      if (k <= 0) return pts[Math.max(0, k)];
      if (k === -1) return pts[pts.length - 1];
      const a = pts[k - 1], b = pts[k];
      const f = (x - a.x) / (b.x - a.x || 1);
      return { x, y: lerp(a.y, b.y, f) };
    };
  };
  let painAt = null, milesAt = null;
  if (painPath && milesPath) { painAt = sampleByX(painPath); milesAt = sampleByX(milesPath); }
  const painLabels = ['Severe', 'Easing', 'Lifting', 'Low', 'Pain-free'];
  function setStory(p) {
    if (!painAt) return;
    const x = 40 + 540 * p;
    clipRect.setAttribute('width', (540 * p + 2).toFixed(1));
    const pp = painAt(x), mp = milesAt(x);
    painDot.setAttribute('cx', pp.x.toFixed(1)); painDot.setAttribute('cy', pp.y.toFixed(1));
    milesDot.setAttribute('cx', mp.x.toFixed(1)); milesDot.setAttribute('cy', mp.y.toFixed(1));
    const miles = clamp((340 - mp.y) / 270, 0, 1) * 4;
    milesValue.textContent = (p > 0.985 ? 4 : miles).toFixed(1);
    painState.textContent = painLabels[Math.min(4, Math.floor(p * 4.999))];
  }
  setStory(0);
  const isMobileStory = () => window.innerWidth <= 900;
  let storyTimed = false;
  if (storyGrid && 'IntersectionObserver' in window) {
    const chartIO = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || !isMobileStory() || storyTimed) return;
      storyTimed = true;
      if (reduced) { setStory(1); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const p = clamp((now - t0) / 3600);
        setStory(easeInOut(p));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    chartIO.observe($('#story-chart'));
  }

  // Method banner parallax
  const bannerImg = $('.method__banner img');

  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight - vh;

    header.classList.toggle('is-scrolled', y > 30);
    progressBar.style.transform = `scaleX(${clamp(y / (docH || 1)).toFixed(4)})`;

    if (heroEl) heroTarget = 0.12 + 0.88 * clamp(y / (heroEl.offsetHeight * 0.55));

    if (promiseWords.length) {
      const r = promiseText.getBoundingClientRect();
      const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3));
      const lit = Math.floor(p * promiseWords.length * 1.1);
      for (let i = 0; i < promiseWords.length; i++) promiseWords[i].classList.toggle('lit', reduced || i < lit);
    }

    if (storyGrid && !isMobileStory()) {
      const r = storyGrid.getBoundingClientRect();
      const p = clamp((vh * 0.55 - r.top) / (r.height - vh * 0.55));
      setStory(reduced ? 1 : p);
    }

    if (bannerImg && !reduced) {
      const r = bannerImg.parentElement.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        const off = (r.top + r.height / 2 - vh / 2) * -0.12;
        bannerImg.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
      }
    }
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* =========================================================
     Counters
     ========================================================= */
  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        const end = +e.target.dataset.count;
        if (reduced) { e.target.textContent = end; return; }
        const t0 = performance.now();
        const tick = (now) => {
          const p = clamp((now - t0) / 1800);
          e.target.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    counters.forEach((c) => cio.observe(c));
  }

  /* =========================================================
     HUD trace on the EEG photo
     ========================================================= */
  const hud = $('.hud');
  const hudTrace = $('#hud-trace');
  if (hud && hudTrace) {
    const hudStates = [
      { name: 'ALPHA', freq: '10.5 Hz', comps: [[0.32, 0.6, 7], [0.9, 0.12, 13]] },
      { name: 'THETA', freq: '6.0 Hz', comps: [[0.18, 0.75, 4], [0.7, 0.1, 9]] },
      { name: 'BETA', freq: '19 Hz', comps: [[0.75, 0.35, 16], [1.4, 0.25, 22], [0.3, 0.15, 5]] },
      { name: 'HEIGHTENED', freq: 'BALANCED', comps: [[0.32, 0.45, 7], [0.16, 0.35, 4], [0.75, 0.16, 15], [0.07, 0.25, 1.5]] },
    ];
    const hudName = $('#hud-state'), hudFreq = $('#hud-freq');
    let idx = 0, since = 0, lastT = 0;
    const setHudH = () => hud.style.setProperty('--hud-h', hud.offsetHeight + 'px');
    setHudH();
    window.addEventListener('resize', setHudH);
    runWhenVisible(hud, (t) => {
      if (!lastT) lastT = t;
      since += t - lastT; lastT = t;
      if (since > 4.5) {
        since = 0; idx = (idx + 1) % hudStates.length;
        hudName.textContent = hudStates[idx].name; hudFreq.textContent = hudStates[idx].freq;
      }
      hudTrace.setAttribute('d', tracePath(200, 40, t, hudStates[idx].comps));
    });
  }

  /* =========================================================
     MIND MIRROR (illustrative)
     ========================================================= */
  const mirrorCanvas = $('#mirror-canvas');
  if (mirrorCanvas) {
    const HZ = ['38', '30', '24', '19', '15', '12.5', '10.5', '9', '7.5', '6', '4.5', '3', '1.5', '.75'];
    const COLORS = ['#f6dc9a', '#f2d08a', '#ecc27b', '#e6b36f', '#e2a86c', '#f0a0b8', '#ea96c4', '#d892d6', '#b48cff', '#9d86ff', '#8a84ff', '#7a86ff', '#6c8aff', '#5f90ff'];
    const GROUPS = [['BETA', 0, 4], ['ALPHA', 5, 7], ['THETA', 8, 9], ['DELTA', 10, 13]];
    const STATES = {
      beta: {
        title: 'Busy mind', kicker: 'Beta · 13–30 Hz',
        desc: 'Alert, thinking, solving, planning. Useful, but when beta runs the show without alpha and theta beneath it, we feel scattered, tense and stuck in our heads.',
        L: [0.55, 0.72, 0.88, 0.92, 0.82, 0.42, 0.24, 0.2, 0.18, 0.16, 0.2, 0.24, 0.28, 0.3], asym: 0.16,
      },
      alpha: {
        title: 'Relaxed awareness', kicker: 'Alpha · 8–12 Hz',
        desc: 'Calm, present and easy. Alpha is the bridge between your conscious mind and everything beneath it, and often the first state people learn to reach on purpose.',
        L: [0.1, 0.14, 0.18, 0.24, 0.3, 0.58, 0.96, 0.86, 0.46, 0.3, 0.24, 0.24, 0.28, 0.28], asym: 0.02,
      },
      theta: {
        title: 'Deep meditation', kicker: 'Theta · 4–7 Hz',
        desc: 'The doorway to the inner world: vivid imagery, insight and deep, nourishing calm. Many people slip past it into sleep; Consciousness Athletes learn to stay awake inside it.',
        L: [0.07, 0.09, 0.11, 0.14, 0.17, 0.3, 0.5, 0.56, 0.82, 0.96, 0.7, 0.42, 0.34, 0.3], asym: -0.08,
      },
      delta: {
        title: 'Deep sleep', kicker: 'Delta · 0.5–4 Hz',
        desc: 'The slowest waves, dominant in deep, dreamless sleep. In trained meditators a little delta while awake is linked to a radar-like, intuitive sense of others.',
        L: [0.04, 0.05, 0.07, 0.09, 0.11, 0.14, 0.2, 0.22, 0.3, 0.4, 0.62, 0.86, 0.96, 0.92], asym: 0,
      },
      heightened: {
        title: 'Heightened awareness', kicker: 'The state Consciousness Athletes train for',
        desc: 'Beta, alpha, theta and delta all present and balanced on both sides of the brain. Clear and alert, yet open, intuitive and deeply calm. This is the state Bethany coaches people into, and then teaches them to live from.',
        L: [0.2, 0.3, 0.42, 0.48, 0.44, 0.62, 0.92, 0.88, 0.72, 0.64, 0.5, 0.58, 0.68, 0.62], asym: 0,
      },
    };
    const ORDER = ['beta', 'alpha', 'theta', 'delta', 'heightened'];
    const tabs = $$('.mirror__tab');
    const info = $('.mirror__info');
    const elTitle = $('#mirror-title'), elKicker = $('#mirror-kicker'), elDesc = $('#mirror-desc');
    const cur = { L: new Array(14).fill(0.05), R: new Array(14).fill(0.05) };
    let target = null, current = 'beta', userPicked = false, cycleT = 0, lastT = 0;
    const jit = Array.from({ length: 28 }, (_, i) => ({ sp: 1.3 + (i % 7) * 0.37, ph: i * 1.7 }));

    function select(name, fromUser) {
      current = name;
      const s = STATES[name];
      target = { L: s.L.slice(), R: s.L.map((v, k) => clamp(v * (1 - s.asym * (k < 6 ? 1 : 0.3)), 0.03, 1)) };
      tabs.forEach((tb) => tb.setAttribute('aria-selected', String(tb.dataset.state === name)));
      tabs.forEach((tb) => tb.setAttribute('tabindex', tb.dataset.state === name ? '0' : '-1'));
      elTitle.textContent = s.title; elKicker.textContent = s.kicker; elDesc.textContent = s.desc;
      info.classList.remove('is-swapping'); void info.offsetWidth; info.classList.add('is-swapping');
      if (fromUser) userPicked = true;
      cycleT = 0;
    }
    tabs.forEach((tb, i) => {
      tb.addEventListener('click', () => select(tb.dataset.state, true));
      tb.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus(); select(next.dataset.state, true);
      });
    });
    select(reduced ? 'heightened' : 'beta', false);
    if (reduced) { cur.L = target.L.slice(); cur.R = target.R.slice(); }

    const mm = setupCanvas(mirrorCanvas);
    const traceCanvas = $('#mirror-trace');
    const tr = setupCanvas(traceCanvas);

    runWhenVisible(mirrorCanvas.closest('.mirror__panel'), (t, dt) => {
      if (!lastT) lastT = t;
      cycleT += t - lastT; lastT = t;
      if (!userPicked && cycleT > 7) select(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length], false);

      const k = Math.min(1, dt * 3.2);
      for (let i = 0; i < 14; i++) { cur.L[i] = lerp(cur.L[i], target.L[i], k); cur.R[i] = lerp(cur.R[i], target.R[i], k); }

      const { ctx, w, h } = mm;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, colW = 46, pad = 8, side = w < 520 ? 34 : 54;
      const maxLen = cx - colW / 2 - side;
      const rowH = (h - pad * 2) / 14;
      const bh = rowH * 0.56;
      const tipsL = [], tipsR = [];

      // center column
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      roundRect(ctx, cx - colW / 2, pad - 4, colW, h - pad * 2 + 8, 12); ctx.fill();

      for (let i = 0; i < 14; i++) {
        const y = pad + rowH * (i + 0.5);
        for (let side2 = 0; side2 < 2; side2++) {
          const v = side2 === 0 ? cur.L[i] : cur.R[i];
          const j = jit[i + side2 * 14];
          const live = reduced ? 1 : 1 + 0.035 * Math.sin(t * j.sp * 0.7 + j.ph) + 0.015 * Math.sin(t * j.sp * 1.6 + j.ph * 0.5);
          const len = Math.max(4, v * live * maxLen);
          const x0 = side2 === 0 ? cx - colW / 2 - 6 : cx + colW / 2 + 6;
          const x1 = side2 === 0 ? x0 - len : x0 + len;
          const g = ctx.createLinearGradient(x0, 0, x1, 0);
          g.addColorStop(0, COLORS[i] + '22');
          g.addColorStop(1, COLORS[i]);
          ctx.fillStyle = g;
          ctx.shadowColor = COLORS[i];
          ctx.shadowBlur = 14 * v;
          roundRect(ctx, Math.min(x0, x1), y - bh / 2, Math.abs(x1 - x0), bh, bh / 2);
          ctx.fill();
          (side2 === 0 ? tipsL : tipsR).push([x1, y]);
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(241,234,220,0.5)';
        ctx.font = '600 10px Manrope, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(HZ[i], cx, y);
      }

      // silhouette outline through the bar tips
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(246,227,176,0.35)';
      for (const tips of [tipsL, tipsR]) {
        ctx.beginPath();
        ctx.moveTo(cx + (tips === tipsL ? -colW / 2 : colW / 2), pad);
        for (let i = 0; i < tips.length - 1; i++) {
          const [x, y] = tips[i], [nx, ny] = tips[i + 1];
          if (i === 0) ctx.lineTo(x, y);
          ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
        }
        const last = tips[tips.length - 1];
        ctx.lineTo(last[0], last[1]);
        ctx.lineTo(cx + (tips === tipsL ? -colW / 2 : colW / 2), h - pad);
        ctx.stroke();
      }

      // group labels
      ctx.font = '700 9px Manrope, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(226,194,125,0.65)';
      for (const [label, a, b] of GROUPS) {
        const y = pad + rowH * ((a + b + 1) / 2);
        ctx.textAlign = 'left'; ctx.fillText(label, 2, y);
        ctx.textAlign = 'right'; ctx.fillText(label, w - 2, y);
        ctx.strokeStyle = 'rgba(226,194,125,0.18)';
        ctx.beginPath(); ctx.moveTo(side - 10, pad + rowH * a + 3); ctx.lineTo(side - 10, pad + rowH * (b + 1) - 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w - side + 10, pad + rowH * a + 3); ctx.lineTo(w - side + 10, pad + rowH * (b + 1) - 3); ctx.stroke();
      }

      // raw-signal trace below
      const avg = (a, b) => { let s = 0; for (let i = a; i <= b; i++) s += cur.L[i]; return s / (b - a + 1); };
      const wb = avg(0, 4), wa = avg(5, 7), wt = avg(8, 9), wd = avg(10, 13);
      const tc = tr.ctx;
      tc.clearRect(0, 0, tr.w, tr.h);
      tc.lineWidth = 1.5;
      tc.strokeStyle = '#e2c27d';
      tc.shadowColor = 'rgba(246,227,176,0.8)';
      tc.shadowBlur = 6;
      tc.beginPath();
      const secs = 2.2;
      for (let x = 0; x <= tr.w; x += 1.5) {
        const s = (x / tr.w) * secs + t;
        const y = Math.sin(s * TAU * 19) * wb * 0.35 + Math.sin(s * TAU * 27 + 1) * wb * 0.18 + Math.sin(s * TAU * 10.2) * wa * 0.6 + Math.sin(s * TAU * 6) * wt * 0.65 + Math.sin(s * TAU * 1.6) * wd * 0.8;
        const py = tr.h / 2 + y * tr.h * 0.24;
        if (x === 0) tc.moveTo(x, py); else tc.lineTo(x, py);
      }
      tc.stroke();
      tc.shadowBlur = 0;
    });
  }

  /* =========================================================
     BREATHE: 60-second coherence practice
     ========================================================= */
  const orb = $('#orb');
  if (orb) {
    const startBtn = $('#breathe-start');
    const btnLabel = $('#breathe-btn-label');
    const label = $('#orb-label');
    const timer = $('#orb-timer');
    const ring = $('#orb-progress');
    const after = $('#breathe-after');
    const CIRC = 590.6, TOTAL = 60, CYCLE = 10;
    let running = false, startAt = 0, coh = 0.12, finished = false, lastPhase = '';
    const waveCanvas = $('#breathe-wave');
    const wave = setupCanvas(waveCanvas);

    function setLabel(txt) { if (label.textContent !== txt) label.textContent = txt; }
    function stop(done) {
      running = false;
      finished = !!done;
      btnLabel.textContent = done ? 'Go again' : 'Begin 60 seconds';
      setLabel(done ? 'Beautifully done' : 'Ready when you are');
      timer.textContent = done ? '✦' : '60';
      ring.style.strokeDashoffset = done ? 0 : CIRC;
      if (done) after.hidden = false;
    }
    startBtn.addEventListener('click', () => {
      if (running) { stop(false); return; }
      running = true; finished = false; startAt = performance.now(); lastPhase = '';
      after.hidden = true;
      btnLabel.textContent = 'Stop';
      // On stacked (mobile) layouts the orb sits below the button: bring it into view.
      if (window.innerWidth <= 900) orb.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    });

    runWhenVisible(orb.closest('.breathe'), (t, dt) => {
      let s;
      if (running) {
        const el = (performance.now() - startAt) / 1000;
        if (el >= TOTAL) { stop(true); s = 0.8; }
        else {
          const ph = (el % CYCLE) / CYCLE;
          if (ph < 0.5) { s = 0.56 + 0.44 * easeInOut(ph * 2); if (lastPhase !== 'in') { lastPhase = 'in'; setLabel('Breathe in'); } }
          else { s = 1 - 0.44 * easeInOut((ph - 0.5) * 2); if (lastPhase !== 'out') { lastPhase = 'out'; setLabel('Breathe out'); } }
          timer.textContent = String(Math.ceil(TOTAL - el));
          ring.style.strokeDashoffset = (CIRC * (1 - el / TOTAL)).toFixed(1);
          coh = lerp(coh, 0.12 + 0.88 * smooth(clamp(el / 38)), Math.min(1, dt * 2));
        }
      } else {
        s = 0.66 + 0.035 * Math.sin(t * 1.3);
        coh = lerp(coh, finished ? 1 : 0.12, Math.min(1, dt * 1.5));
      }
      orb.style.setProperty('--s', s.toFixed(4));

      const { ctx, w, h } = wave;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(164,140,255,0)');
      g.addColorStop(0.2, 'rgba(164,140,255,0.9)');
      g.addColorStop(0.7, 'rgba(226,194,125,1)');
      g.addColorStop(1, 'rgba(246,227,176,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(226,194,125,0.6)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const u = x / w;
        const noise = Math.sin(u * 61 + t * 3.1) * 0.35 + Math.sin(u * 23 - t * 2.3) * 0.45 + Math.sin(u * 97 + t * 5.3) * 0.2 + Math.sin(u * 37 + t * 1.1) * 0.3;
        const sine = Math.sin(u * TAU * 2.2 - t * 1.6);
        const y = h / 2 + lerp(noise, sine, coh) * h * 0.34;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  /* =========================================================
     GLOBE: cities lighting up one at a time
     ========================================================= */
  const globeCanvas = $('#globe');
  if (globeCanvas) {
    const r = rng(42);
    const g = setupCanvas(globeCanvas);
    const N = window.innerWidth < 700 ? 480 : 820;
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      pts.push([Math.cos(th) * rad, y, Math.sin(th) * rad]);
    }
    const CITY_N = 13;
    const cities = [];
    while (cities.length < CITY_N) {
      const p = pts[Math.floor(r() * N)];
      if (Math.abs(p[1]) > 0.75) continue;
      if (cities.some((c) => Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) < 0.42)) continue;
      cities.push(p);
    }
    const STEP = 1.1, CYCLE_LEN = CITY_N * STEP + 5;
    const tilt = -0.32;

    const rot = (p, a) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      let x = p[0] * ca + p[2] * sa;
      let z = -p[0] * sa + p[2] * ca;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const y = p[1] * ct - z * st;
      z = p[1] * st + z * ct;
      return [x, y, z];
    };
    const slerp = (a, b, t) => {
      const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
      const om = Math.acos(dot);
      if (om < 1e-4) return a;
      const s = Math.sin(om);
      const k1 = Math.sin((1 - t) * om) / s, k2 = Math.sin(t * om) / s;
      return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
    };

    runWhenVisible(globeCanvas, (t) => {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.38;
      const a = t * 0.06;

      const atm = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.35);
      atm.addColorStop(0, 'rgba(75,54,168,0.25)');
      atm.addColorStop(0.75, 'rgba(164,140,255,0.08)');
      atm.addColorStop(1, 'rgba(164,140,255,0)');
      ctx.fillStyle = atm;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(226,194,125,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      for (const p of pts) {
        const [x, y, z] = rot(p, a);
        if (z < -0.05) {
          ctx.fillStyle = 'rgba(241,234,220,0.05)';
          ctx.fillRect(cx + x * R, cy + y * R, 1, 1);
        } else {
          const al = 0.12 + 0.5 * z;
          const sz = 0.9 + z * 0.9;
          ctx.fillStyle = `rgba(241,234,220,${al.toFixed(3)})`;
          ctx.fillRect(cx + x * R - sz / 2, cy + y * R - sz / 2, sz, sz);
        }
      }

      const ct = reduced ? CYCLE_LEN - 3.3 : t % CYCLE_LEN;
      const fade = ct > CYCLE_LEN - 1.2 ? clamp((CYCLE_LEN - ct) / 1.2) : 1;
      const active = Math.min(CITY_N, Math.floor(ct / STEP) + 1);
      ctx.globalCompositeOperation = 'lighter';

      // arcs between consecutive active cities (+ a few cross-links)
      for (let i = 1; i < active; i++) {
        const links = [[i - 1, i]];
        if (i >= 3 && i % 3 === 0) links.push([i - 3, i]);
        for (const [ia, ib] of links) {
          const age = clamp((ct - i * STEP) / 0.9);
          ctx.beginPath();
          let started = false;
          const SEG = 40;
          for (let s = 0; s <= SEG * age; s++) {
            const u = s / SEG;
            const p = slerp(cities[ia], cities[ib], u);
            const lift = 1 + 0.22 * Math.sin(Math.PI * u);
            const [x, y, z] = rot([p[0] * lift, p[1] * lift, p[2] * lift], a);
            if (z < -0.15) { started = false; continue; }
            const X = cx + x * R, Y = cy + y * R;
            if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
          }
          ctx.strokeStyle = `rgba(226,194,125,${(0.55 * fade).toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          // travelling pulse
          const u = (t * 0.28 + i * 0.37) % 1;
          const p = slerp(cities[ia], cities[ib], u);
          const lift = 1 + 0.22 * Math.sin(Math.PI * u);
          const [x, y, z] = rot([p[0] * lift, p[1] * lift, p[2] * lift], a);
          if (z > -0.1 && age >= 1) {
            ctx.fillStyle = `rgba(246,227,176,${(0.9 * fade).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(cx + x * R, cy + y * R, 2.2, 0, TAU); ctx.fill();
          }
        }
      }

      // cities
      for (let i = 0; i < CITY_N; i++) {
        const [x, y, z] = rot(cities[i], a);
        if (z < -0.1) continue;
        const X = cx + x * R, Y = cy + y * R;
        const on = i < active;
        const depth = 0.35 + 0.65 * clamp(z + 0.1);
        if (on) {
          const born = clamp((ct - i * STEP) / 0.6);
          const glow = ctx.createRadialGradient(X, Y, 0, X, Y, 16);
          glow.addColorStop(0, `rgba(246,227,176,${(0.9 * depth * fade).toFixed(3)})`);
          glow.addColorStop(1, 'rgba(246,227,176,0)');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(X, Y, 16 * born, 0, TAU); ctx.fill();
          const rp = (t * 0.4 + i * 0.29) % 1;
          ctx.strokeStyle = `rgba(226,194,125,${((1 - rp) * 0.6 * depth * fade).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(X, Y, 4 + rp * 22, 0, TAU); ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(164,140,255,${(0.45 * depth).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(X, Y, 2, 0, TAU); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  /* =========================================================
     Footer calm wave
     ========================================================= */
  const footerCanvas = $('#footer-wave');
  if (footerCanvas) {
    const fw = setupCanvas(footerCanvas);
    runWhenVisible(footerCanvas, (t) => {
      const { ctx, w, h } = fw;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const u = x / w;
          const y = h * 0.55 + Math.sin(u * TAU * 1.4 - t * 0.3 + i * 0.25) * (18 - i * 2.5) + i * 4;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(226,194,125,${(0.08 + i * 0.05).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  /* =========================================================
     Pointer polish: glow, magnetic buttons, card spotlights
     ========================================================= */
  if (finePointer && !reduced) {
    // subtle spotlight that follows the pointer on pillar and offer cards
    $$('.pillar, .offer').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* =========================================================
     Contact form
     ========================================================= */
  const form = $('#contact-form');
  const interestSelect = $('#f-interest');
  $$('[data-interest]').forEach((link) => {
    link.addEventListener('click', () => {
      const want = link.dataset.interest;
      const opt = Array.from(interestSelect.options).find((o) => o.value === want || o.text === want);
      if (opt) { interestSelect.value = opt.value; interestSelect.closest('.field').classList.remove('is-invalid'); }
    });
  });

  if (form) {
    const status = $('#form-status');
    const submit = $('#form-submit');
    const submitLabel = $('.btn__label', submit);
    const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

    const showStatus = (type, msg) => {
      status.hidden = false;
      status.dataset.type = type;
      status.textContent = msg;
    };

    $$('input, select, textarea', form).forEach((el) => {
      el.addEventListener('input', () => el.closest('.field').classList.remove('is-invalid'));
      el.addEventListener('change', () => el.closest('.field').classList.remove('is-invalid'));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const invalid = [];
      if (!String(data.name || '').trim()) invalid.push('f-name');
      if (!emailOk(String(data.email || '').trim())) invalid.push('f-email');
      if (!data.interest) invalid.push('f-interest');
      if (!String(data.message || '').trim()) invalid.push('f-message');
      $$('.field', form).forEach((f) => f.classList.remove('is-invalid'));
      if (invalid.length) {
        invalid.forEach((id) => document.getElementById(id).closest('.field').classList.add('is-invalid'));
        document.getElementById(invalid[0]).focus();
        showStatus('error', 'Please fill in your name, a valid email, what you are interested in, and a short message.');
        return;
      }

      submit.disabled = true;
      submitLabel.textContent = 'Sending…';
      status.hidden = true;
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || 'Your message could not be sent.');
        const first = String(data.name).trim().split(/\s+/)[0];
        showStatus('success', `Thank you, ${first}. Your message is on its way, and you'll hear back soon.`);
        form.reset();
        form.classList.add('is-sent');
        submitLabel.textContent = 'Message sent ✓';
        setTimeout(() => { form.classList.remove('is-sent'); submitLabel.textContent = 'Send message'; }, 5000);
      } catch (err) {
        showStatus('error', `${err.message} Please try again in a moment.`);
        submitLabel.textContent = 'Send message';
      } finally {
        submit.disabled = false;
      }
    });
  }

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
