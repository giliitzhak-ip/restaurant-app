/* ============================================================
   UI helpers, routing, shell
   ============================================================ */
const IC = {
  drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  snow:'<path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  bug:'<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M12 7V4M9 4l1.5 3M15 4l-1.5 3M4 11h4M16 11h4M4 17h4M16 17h4"/>',
  brick:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4"/>',
  cam:'<path d="M3 7l14 4-1.5 4.5L1.5 11.5z"/><path d="M8 13.5 7 18H3M17 11l3-1"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  leaf:'<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19 13 11"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  brush:'<path d="M14 4l6 6-8 8-6-6z"/><path d="M6 12c-2 2-3 5-3 8 3 0 6-1 8-3"/>',
  tool:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  window:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
  truck:'<path d="M2 6h12v10H2zM14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  home:'<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  brief:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
  wallet:'<path d="M4 7h15a1 1 0 0 1 1 1v11H4a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h12v3"/><circle cx="16" cy="13" r="1.3"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.4 2.2 4 5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  percent:'<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  shield:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  check:'<path d="m5 12 5 5 9-10"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  pin:'<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  play:'<path d="M7 4v16l13-8z"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sliders:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  phone:'<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>'
};
const icon = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;
const pill = (text, tone) => `<span class="pill ${tone || ''}">${esc(text)}</span>`;
const statusPill = (s) => pill(STATUS[s].name, STATUS[s].tone);
const commPill = (s) => pill(COMM_STATUS[s].name, COMM_STATUS[s].tone);
const payPill = (st) => pill(PAY_STATE[st][0], PAY_STATE[st][1]);
const SIM = '<span class="sim">הדגמה</span>';
const stars = (r) => { const f = Math.round(r); return `<span class="stars" aria-label="דירוג ${r} מתוך 5">${'★'.repeat(f)}${'☆'.repeat(5 - f)}</span>`; };
const empty = (ic, title, sub) => `<div class="empty">${icon(ic, 34)}<h3>${esc(title)}</h3>${sub ? `<p class="small" style="margin-top:4px">${esc(sub)}</p>` : ''}</div>`;
const notice = (tone, ic, html) => `<div class="notice ${tone}">${icon(ic, 18)}<div>${html}</div></div>`;
const kpi = (label, value, sub) => `<div class="kpi"><div class="label">${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
const cityOptions = (sel, placeholder = 'בחרו עיר') => `<option value="">${placeholder}</option>` + Object.keys(REGIONS).map(r =>
  `<optgroup label="${REGIONS[r]}">${CITIES.filter(c => c[1] === r).map(c => opt(c[0], c[0], c[0] === sel)).join('')}</optgroup>`).join('');
const catOptions = (sel, placeholder = 'בחרו תחום') => `<option value="">${placeholder}</option>` + CATS.map(c => opt(c.id, c.name, c.id === sel)).join('');

/* ---------- UI state & routing ---------- */
const U = {
  role: 'customer', tab: 'home', sheet: null,
  form: { cat: '', city: '', urgency: 'soon', desc: '', image: null, name: '', phone: '', email: '', address: '', consent: true },
  errors: {}, submitting: false, justCreated: null,
  trackCode: '',
  lf: { q: '', city: '', cat: '', status: '', from: '', to: '' },
  pf: { q: '', cat: '', state: '' },
  sim: { cat: 'plumbing', city: 'תל אביב-יפו', urgency: 'now' },
  rangeDays: 30,
  quoteDraft: {}, payDraft: {}
};
const TABS = {
  customer: [['home','בית','home'],['request','בקשה חדשה','plus'],['track','מעקב בקשה','search']],
  pro: [['home','לוח בקרה','grid'],['requests','בקשות','inbox'],['jobs','עבודות','brief'],['earnings','הכנסות','wallet'],['profile','פרופיל','user']],
  admin: [['overview','סקירה','chart'],['leads','לידים','list'],['providers','בעלי מקצוע','users'],['commissions','עמלות','percent'],['more','עוד','more']]
};
const ADMIN_MORE = { customers: ['לקוחות','users'], categories: ['קטגוריות ותעריפים','tag'], matching: ['מנוע ההתאמה','sliders'], complaints: ['תלונות','flag'], reports: ['דוחות וניתוחים','chart'] };
const PREFIX = { customer: 'c', pro: 'p', admin: 'a' };

function go(role, tab, keepScroll) {
  U.role = role; U.tab = tab;
  const h = '#' + PREFIX[role] + '-' + tab;
  if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } }
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}
function fromHash() {
  const m = /^#([cpa])-([a-z]+)$/.exec(location.hash || '');
  if (!m) return;
  const role = { c: 'customer', p: 'pro', a: 'admin' }[m[1]];
  const ok = TABS[role].some(t => t[0] === m[2]) || (role === 'admin' && ADMIN_MORE[m[2]]);
  if (ok) { U.role = role; U.tab = m[2]; }
}

function badges() {
  const b = {};
  b.requests = S.leads.filter(l => !l.assignedTo && l.offers.some(o => o.pid === S.proId && o.status === 'pending') && l.status === 'matched').length;
  b.jobs = S.leads.filter(l => l.assignedTo === S.proId && ['accepted','approved','in_progress','completed'].includes(l.status)).length;
  b.leads = S.leads.filter(l => ['unmatched','pending_info','no_consent'].includes(l.status)).length;
  b.more = S.complaints.filter(c => c.status !== 'resolved').length;
  b.commissions = S.leads.filter(l => l.commission.status === 'disputed').length;
  return b;
}
function renderTabs() {
  const b = badges();
  const cur = (U.role === 'admin' && ADMIN_MORE[U.tab]) ? 'more' : U.tab;
  document.getElementById('tabs').innerHTML = TABS[U.role].map(([id, label, ic]) =>
    `<button data-act="tab" data-tab="${id}"${id === cur ? ' aria-current="page"' : ''}>${icon(ic, 22)}<span>${label}</span>${b[id] ? `<span class="badge num">${b[id]}</span>` : ''}</button>`).join('');
  document.querySelectorAll('.roles button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.role === U.role)));
}
function render() {
  renderTabs();
  const v = VIEWS[U.role][U.tab] || VIEWS[U.role][TABS[U.role][0][0]];
  document.getElementById('view').innerHTML = v();
  afterRender();
  renderFab();
}
function refresh() { save(); render(); if (U.sheet) renderSheet(); }

let toastT;
function toast(msg, bad) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast' + (bad ? ' bad' : ''); }, 2800);
}

/* ---------- sheet ---------- */
function openSheet(type, id) { U.sheet = { type, id }; renderSheet(); document.getElementById('sheet').classList.add('open'); document.getElementById('scrim').classList.add('open'); }
function closeSheet() { U.sheet = null; document.getElementById('sheet').classList.remove('open'); document.getElementById('scrim').classList.remove('open'); }
function renderSheet() {
  const s = U.sheet; if (!s) return;
  const r = SHEETS[s.type](s.id);
  document.getElementById('sheet-title').innerHTML = r.title;
  document.getElementById('sheet-body').innerHTML = r.body;
}

/* ---------- hero map (decorative, drawn once) ---------- */
const MAP_PTS = [[33.21,35.57],[33.0,35.1],[32.96,35.5],[32.92,35.3],[32.79,34.99],[32.79,35.53],[32.7,35.3],[32.61,35.29],[32.43,34.92],[32.33,34.86],[32.16,34.84],[32.09,34.88],[32.08,34.78],[31.89,34.81],[31.9,35.01],[31.8,34.65],[31.77,35.21],[31.75,34.99],[31.67,34.57],[31.61,34.76],[31.25,34.79],[31.07,35.03],[30.61,34.8],[29.56,34.95]];
function drawHeroMap() {
  const c = document.getElementById('hero-map'); if (!c) return;
  const box = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  c.width = box.width * dpr; c.height = box.height * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const H = box.height - 24, W = H * 0.42, x0 = 18;
  const pts = MAP_PTS.map(([la, lo]) => [x0 + (lo - 34.2) / 1.6 * W, 12 + (33.35 - la) / 3.9 * H]);
  g.strokeStyle = 'rgba(44,211,200,.35)'; g.lineWidth = 1;
  pts.forEach((a, i) => pts.forEach((b, j) => { if (j <= i) return; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < H * 0.13) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } }));
  pts.forEach(([x, y], i) => { g.fillStyle = i % 5 === 0 ? '#2CD3C8' : 'rgba(244,248,252,.75)'; g.beginPath(); g.arc(x, y, i % 5 === 0 ? 3.2 : 2.1, 0, 7); g.fill(); });
}
function afterRender() { drawHeroMap(); }
