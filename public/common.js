// Utilitários compartilhados + ilustrações botânicas em SVG

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function safeSession(key, val) {
  try {
    if (val === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, val);
  } catch (e) { return null; }
}

// ── Datas (a data do evento é tratada como data local, sem fuso) ──
function parseDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y ? new Date(Date.UTC(y, m - 1, d, 12)) : null;
}
const fmt = (d, o) => (d ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...o }).format(d) : '');
const fmtWeekday = (d) => fmt(d, { weekday: 'long' });
const fmtMonth = (d) => fmt(d, { month: 'long' });
const fmtDots = (d) => (d ? fmt(d, { day: '2-digit' }) + ' · ' + fmt(d, { month: '2-digit' }) + ' · ' + fmt(d, { year: 'numeric' }) : '');
const fmtLong = (d) => fmt(d, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = (d) => fmt(d, { day: 'numeric', month: 'long' });

// ───────────────────────── Botânica ─────────────────────────
const BOT = (() => {
  const C = {
    olive: '#4D5230', oliveDeep: '#363A24', sage: '#9A9A78', tea: '#D9B6A6', rose: '#E5C8BC',
    gold: '#B08A3C', goldLight: '#C7A45B', ivory: '#F6F0E5', petalLine: '#C49A88', heart: '#B98676',
  };
  const f = (n) => Number(n.toFixed(2));
  let uid = 0;

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const qp = (a, b, c, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; };
  const qa = (a, b, c, t) => Math.atan2(2 * (1 - t) * (b[1] - a[1]) + 2 * t * (c[1] - b[1]), 2 * (1 - t) * (b[0] - a[0]) + 2 * t * (c[0] - b[0])) * 180 / Math.PI;

  // folha lanceolada (oliveira) apontando para +x
  function leaf(x, y, rot, len, w, fill, op) {
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">` +
      `<path d="M0 0C${f(len * .22)} ${f(-w)} ${f(len * .68)} ${f(-w * .95)} ${f(len)} 0C${f(len * .68)} ${f(w * .95)} ${f(len * .22)} ${f(w)} 0 0Z" fill="${fill}" fill-opacity="${op}"/>` +
      `<path d="M${f(len * .1)} 0H${f(len * .82)}" stroke="${C.ivory}" stroke-opacity=".4" stroke-width=".35"/></g>`;
  }

  // ramo de oliveira ao longo de uma curva quadrática
  function olive(p0, p1, p2, { count = 8, len = 20, seed = 1, olives = [], width = .9 } = {}) {
    const r = rng(seed);
    let s = `<path d="M${f(p0[0])} ${f(p0[1])}Q${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])}" fill="none" stroke="${C.olive}" stroke-opacity=".75" stroke-width="${width}" stroke-linecap="round"/>`;
    for (let i = 0; i < count; i++) {
      const t = .1 + (i / Math.max(1, count - 1)) * .82;
      const [x, y] = qp(p0, p1, p2, t);
      const side = i % 2 ? 1 : -1;
      const rot = qa(p0, p1, p2, t) + side * (34 + r() * 14);
      const L = len * (1 - t * .32) * (.88 + r() * .2);
      const dark = r() < .38;
      s += leaf(x, y, rot, L, L * .2, dark ? C.olive : C.sage, dark ? .8 : .92);
    }
    s += leaf(p2[0], p2[1], qa(p0, p1, p2, 1), len * .62, len * .12, C.sage, .9);
    for (const t of olives) {
      const [x, y] = qp(p0, p1, p2, t);
      const a = (qa(p0, p1, p2, t) + 90) * Math.PI / 180;
      const ox = x + Math.cos(a) * 5, oy = y + Math.sin(a) * 5;
      s += `<path d="M${f(x)} ${f(y)}L${f(ox)} ${f(oy)}" stroke="${C.olive}" stroke-opacity=".6" stroke-width=".5"/>` +
        `<ellipse cx="${f(ox)}" cy="${f(oy + 2.4)}" rx="2.3" ry="3" fill="${C.oliveDeep}" fill-opacity=".82"/>` +
        `<circle cx="${f(ox - .7)}" cy="${f(oy + 1.4)}" r=".7" fill="${C.ivory}" fill-opacity=".35"/>`;
    }
    return s;
  }

  // rosa vista de cima, em camadas de pétalas
  function rose(cx, cy, r, rot = 0) {
    const petal = (len, wid) => `M0 0C${f(-wid)} ${f(-len * .25)} ${f(-wid * .9)} ${f(-len)} 0 ${f(-len)}C${f(wid * .9)} ${f(-len)} ${f(wid)} ${f(-len * .25)} 0 0Z`;
    let s = `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${rot})">`;
    for (let i = 0; i < 6; i++) s += `<path d="${petal(r, r * .62)}" transform="rotate(${i * 60})" fill="${C.rose}" stroke="${C.petalLine}" stroke-opacity=".45" stroke-width=".4"/>`;
    for (let i = 0; i < 5; i++) s += `<path d="${petal(r * .68, r * .46)}" transform="rotate(${i * 72 + 30})" fill="${C.tea}" fill-opacity=".9" stroke="${C.petalLine}" stroke-opacity=".5" stroke-width=".4"/>`;
    const k = r / 10;
    s += `<path d="M${f(-k)} 0a${f(k)} ${f(k)} 0 1 1 ${f(2 * k)} 0a${f(1.8 * k)} ${f(1.8 * k)} 0 1 1 ${f(-3.4 * k)} 0a${f(2.6 * k)} ${f(2.6 * k)} 0 1 1 ${f(4.8 * k)} 0" fill="none" stroke="${C.heart}" stroke-opacity=".75" stroke-width=".55"/>`;
    return s + '</g>';
  }

  function bud(x, y, rot, s = 1) {
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s})">` +
      `<path d="M0 0C-4-3-4-9 0-13C4-9 4-3 0 0Z" fill="${C.tea}" stroke="${C.petalLine}" stroke-opacity=".5" stroke-width=".4"/>` +
      `<path d="M0 0C-3-1-5-4-5-7C-2-5-1-3 0 0ZM0 0C3-1 5-4 5-7C2-5 1-3 0 0Z" fill="${C.olive}" fill-opacity=".7"/>` +
      `<path d="M0 0V7" stroke="${C.olive}" stroke-opacity=".7" stroke-width=".6"/></g>`;
  }

  function blossom(x, y, r) {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      s += `<circle cx="${f(x + Math.cos(a) * r * .55)}" cy="${f(y + Math.sin(a) * r * .55)}" r="${f(r * .5)}" fill="${C.rose}" fill-opacity=".85"/>`;
    }
    return s + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * .28)}" fill="${C.goldLight}" fill-opacity=".8"/>`;
  }

  const svg = (vb, inner, cls = '') => `<svg class="${cls}" viewBox="${vb}" fill="none" aria-hidden="true" focusable="false">${inner}</svg>`;

  // canto: oliveira ao longo das bordas + rosas na junção
  function corner(seed = 3, variant = 'a') {
    let s = '';
    if (variant === 'a') {
      s += olive([18, 24], [90, 4], [178, 20], { count: 10, len: 22, seed, olives: [.42, .7] });
      s += olive([22, 20], [4, 92], [20, 172], { count: 9, len: 21, seed: seed + 5, olives: [.55] });
      s += olive([34, 36], [70, 50], [92, 86], { count: 5, len: 15, seed: seed + 9, width: .7 });
      s += rose(30, 30, 17, 12) + rose(58, 22, 10, 40) + bud(22, 60, -150, .9) + bud(76, 40, 120, .75);
      s += blossom(46, 50, 5) + blossom(96, 16, 3.5) + blossom(14, 96, 3.5);
    } else {
      s += olive([24, 26], [96, 10], [170, 30], { count: 9, len: 21, seed, olives: [.5] });
      s += olive([26, 22], [8, 88], [26, 160], { count: 8, len: 20, seed: seed + 4, olives: [.38, .72] });
      s += rose(32, 32, 15, 30) + bud(60, 26, 70, .85) + bud(28, 62, 200, .8);
      s += blossom(52, 48, 4.5) + blossom(108, 22, 3.2);
    }
    return svg('0 0 200 200', s);
  }

  // guirlanda para o monograma
  function wreath() {
    let s = `<circle cx="80" cy="76" r="46" stroke="${C.gold}" stroke-opacity=".5" stroke-width=".6"/>`;
    s += olive([76, 140], [14, 104], [36, 24], { count: 11, len: 15, seed: 11, olives: [.3, .62] });
    s += olive([84, 140], [146, 104], [124, 24], { count: 11, len: 15, seed: 21, olives: [.45] });
    s += rose(80, 138, 9, 18) + bud(66, 142, -110, .7) + bud(94, 142, 110, .7);
    return svg('0 0 160 160', s, 'wreath__svg');
  }

  // divisor: linhas finas que se apagam + elemento central
  function divider(kind = 'olive') {
    const id = 'dg' + ++uid;
    let s = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="234" y2="0"><stop offset="0" stop-color="${C.gold}" stop-opacity="0"/><stop offset=".5" stop-color="${C.gold}" stop-opacity=".7"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></linearGradient></defs>`;
    s += `<path d="M6 20H92M148 20H234" stroke="url(#${id})" stroke-width=".7"/>`;
    if (kind === 'rose') {
      s += olive([120, 21], [108, 16], [96, 19], { count: 3, len: 9, seed: 4, width: .6 });
      s += olive([120, 21], [132, 16], [144, 19], { count: 3, len: 9, seed: 8, width: .6 });
      s += rose(120, 19, 6.5, 20);
    } else {
      s += olive([120, 22], [108, 14], [96, 20], { count: 4, len: 9, seed: 6, width: .6, olives: [.5] });
      s += olive([120, 22], [132, 14], [144, 20], { count: 4, len: 9, seed: 9, width: .6 });
      s += `<circle cx="120" cy="22" r="1.4" fill="${C.gold}"/>`;
    }
    return svg('0 0 240 40', s, 'divider__svg');
  }

  function cross() {
    return svg('0 0 22 34', `<path d="M11 2V32M3.5 11H18.5" stroke="${C.gold}" stroke-width="1.1" stroke-linecap="round"/>` +
      `<circle cx="11" cy="2" r=".9" fill="${C.gold}"/><circle cx="11" cy="32" r=".9" fill="${C.gold}"/><circle cx="3.5" cy="11" r=".9" fill="${C.gold}"/><circle cx="18.5" cy="11" r=".9" fill="${C.gold}"/>`, 'cross__svg');
  }

  // lacre de cera: contorno irregular, relevo e monograma
  function seal(a, b) {
    const r = rng(77), pts = [];
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2;
      const rad = 52 + (r() - .5) * 5 + (i % 7 === 0 ? 2.5 : 0);
      pts.push([60 + Math.cos(ang) * rad, 60 + Math.sin(ang) * rad]);
    }
    let d = '';
    pts.forEach((p, i) => {
      const n = pts[(i + 1) % pts.length];
      const m = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2];
      d += i === 0 ? `M${f(m[0])} ${f(m[1])}` : `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
    });
    d += `Q${f(pts[0][0])} ${f(pts[0][1])} ${f((pts[0][0] + pts[1][0]) / 2)} ${f((pts[0][1] + pts[1][1]) / 2)}Z`;
    const id = 'sg' + ++uid;
    let s = `<defs>
      <radialGradient id="${id}" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#6E7347"/><stop offset=".42" stop-color="${C.olive}"/><stop offset=".85" stop-color="${C.oliveDeep}"/><stop offset="1" stop-color="#2A2D1B"/></radialGradient>
      <radialGradient id="${id}i" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#565B36"/><stop offset="1" stop-color="#3E4228"/></radialGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>`;
    s += `<path d="${d}" fill="url(#${id})"/>`;
    s += `<circle cx="60" cy="60" r="39" fill="url(#${id}i)"/>`;
    s += `<circle cx="60" cy="60" r="39" stroke="#262916" stroke-opacity=".55" stroke-width="2"/>`;
    s += `<circle cx="60.6" cy="60.8" r="40.5" stroke="#fff" stroke-opacity=".08" stroke-width="1"/>`;
    s += `<circle cx="60" cy="60" r="34" stroke="${C.goldLight}" stroke-opacity=".35" stroke-width=".5" stroke-dasharray="1 2.2"/>`;
    const txt = (dx, dy, fill, op) => `<text x="${60 + dx}" y="${68 + dy}" text-anchor="middle" fill="${fill}" fill-opacity="${op}" font-family="Cinzel, serif" font-size="24" letter-spacing="1">${esc(a)}<tspan font-family="Great Vibes, cursive" font-size="22" dx="1" dy="1">&amp;</tspan><tspan dx="1" dy="-1">${esc(b)}</tspan></text>`;
    s += txt(.7, .9, '#1F2114', .55) + txt(0, 0, C.goldLight, .92);
    s += `<ellipse cx="42" cy="34" rx="20" ry="9" transform="rotate(-32 42 34)" fill="url(#${id}s)"/>`;
    return svg('0 0 120 120', s, 'seal__svg');
  }

  return { corner, wreath, divider, cross, seal, colors: C };
})();

const SPRIG = BOT.divider('olive');

const ICON = {
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>',
};

function observeReveal() {
  const els = document.querySelectorAll('.reveal');
  if (reducedMotion() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
  els.forEach((e) => io.observe(e));
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('is-on'));
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('is-on'), 4000);
}

// pétalas suaves caindo lentamente após a confirmação
function celebrate() {
  if (reducedMotion()) return;
  const colors = ['#E5C8BC', '#D9B6A6', '#EFE7D8', '#C7A45B'];
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', (Math.random() * 90 - 45) + 'px');
    p.style.animationDuration = 6 + Math.random() * 4 + 's';
    p.style.animationDelay = Math.random() * 1.5 + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 12000);
  }
}
