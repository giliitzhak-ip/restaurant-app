/* ============================================================
   Demo walkthrough + event wiring
   ============================================================ */
function guideSteps() {
  const l = S.demoLeadId && lead(S.demoLeadId);
  const idx = l ? FLOW.indexOf(l.status) : -1;
  const at = (s) => l && idx >= FLOW.indexOf(s);
  const c = l && commissionOf(S, l);
  return [
    ['יצירת בקשת לקוח', 'ממלאים טופס בממשק הלקוח (יש כפתור "מלאו דוגמה").', !!l, 'g-request'],
    ['התאמת בעל מקצוע', 'המנוע בוחר עד 3 ספקים לפי תנאי הסף והמשקלות.', l && l.offers.length > 0, 'g-match'],
    ['קבלת הבקשה', 'עוברים לבעל מקצוע שקיבל את הבקשה ולוחצים "קבלת העבודה".', l && !!l.assignedTo, 'g-accept'],
    ['שליחת הצעת מחיר', 'בעל המקצוע מזין סכום לפני מע״מ.', l && !!l.quote, 'g-quote'],
    ['אישור העבודה', 'הלקוח מאשר את ההצעה בעמוד המעקב.', at('approved'), 'g-approve'],
    ['השלמת העבודה', 'בעל המקצוע מתחיל ומסמן כהושלם.', at('completed'), 'g-complete'],
    ['רישום תשלום מדומה', 'בעל המקצוע רושם תשלום מלא או חלקי.', l && l.payments.length > 0, 'g-pay'],
    ['חישוב העמלה', c && c.amount ? `עמלה: ${ils2(c.amount)} (${c.rate}% מ־${ils2(c.base)})` : 'מחושבת אוטומטית מהתשלום, בלי מע״מ.', c && c.amount > 0, 'g-pay'],
    ['צפייה בלוח המנהל', 'פותחים את הליד בממשק המנהל ורואים את כל החישוב.', l && S.adminSawDemo, 'g-admin']
  ];
}
function renderFab() {
  const steps = guideSteps(); const done = steps.filter(s => s[2]).length;
  document.getElementById('fab').setAttribute('aria-label', `תרחיש הדגמה, ${done} מתוך 9 שלבים`);
  document.getElementById('fab').innerHTML = `${icon('play', 16)} <span class="fab-t">תרחיש הדגמה</span> <span class="prog num">${done}/9</span>`;
}
SHEETS.guide = () => {
  const steps = guideSteps(); const next = steps.findIndex(s => !s[2]);
  return { title: 'תרחיש הדגמה מלא', body: `<div class="stack"><p class="small muted">9 שלבים מבקשה ועד עמלה. כל שלב מסומן אוטומטית כשמבצעים אותו, וכפתור "לשלב" לוקח אתכם למסך הנכון.</p>
    <div>${steps.map(([t, d, ok, act], i) => `<div class="guide-step${ok ? ' done' : ''}${i === next ? ' next' : ''}"><span class="dot num">${ok ? '✓' : i + 1}</span><div class="grow"><b>${t}</b><div class="small muted">${d}</div></div>${i === next ? `<button class="btn sm" data-act="${act}">לשלב</button>` : ''}</div>`).join('')}</div>
    ${next === -1 ? notice('ok', 'check', 'סיימתם את כל התרחיש. אפשר להתחיל שוב עם בקשה חדשה.') : ''}
    <div class="row"><button class="btn ghost sm" data-act="g-restart">התחלת תרחיש חדש</button></div></div>` };
};

function demoLead() { return S.demoLeadId && lead(S.demoLeadId); }
const GUIDE = {
  'g-request': () => { closeSheet(); U.justCreated = null; if (!U.form.desc) sampleForm(); go('customer', 'request'); toast('מילאנו בשבילכם דוגמה. לחצו "שליחת הבקשה" למטה'); },
  'g-match': () => { closeSheet(); const l = demoLead(); go('admin', 'leads'); openSheet('lead', l.id); },
  'g-accept': () => { const l = demoLead(); const o = l.offers.find(o => o.status === 'pending'); if (o) S.proId = o.pid; closeSheet(); save(); go('pro', 'requests'); toast(`מחוברים כעת כ${prov(S, S.proId).business}`); },
  'g-quote': () => { const l = demoLead(); S.proId = l.assignedTo; closeSheet(); save(); go('pro', 'jobs'); },
  'g-approve': () => { const l = demoLead(); closeSheet(); U.trackCode = l.code; go('customer', 'track'); },
  'g-complete': () => { const l = demoLead(); S.proId = l.assignedTo; closeSheet(); save(); go('pro', 'jobs'); },
  'g-pay': () => { const l = demoLead(); S.proId = l.assignedTo; closeSheet(); save(); go('pro', 'jobs'); },
  'g-admin': () => { const l = demoLead(); go('admin', 'leads'); openSheet('lead', l.id); },
  'g-restart': () => { S.demoLeadId = null; S.adminSawDemo = false; U.justCreated = null; U.form = { cat: '', city: '', urgency: 'soon', desc: '', image: null, name: '', phone: '', email: '', address: '', consent: true }; save(); closeSheet(); go('customer', 'request'); }
};

function num(v) { const n = parseFloat(String(v).replace(/[,₪\s]/g, '')); return isFinite(n) ? n : NaN; }

const ACT = {
  home: () => go(U.role, TABS[U.role][0][0]),
  tab: (el) => go(U.role, el.dataset.tab),
  'switch-role': (el) => go(el.dataset.role, TABS[el.dataset.role][0][0]),
  'close-sheet': closeSheet,
  guide: () => openSheet('guide'),
  open: (el) => openSheet(el.dataset.type === 'complaint' ? 'lead' : el.dataset.type, el.dataset.type === 'complaint' ? S.complaints.find(c => c.id === el.dataset.id).leadId : el.dataset.id),
  'pick-cat': (el) => { U.form.cat = el.dataset.cat; U.justCreated = null; go('customer', 'request'); },
  sample: () => { sampleForm(); render(); },
  urgency: (el) => { U.form.urgency = el.dataset.u; render(); },
  'rm-img': () => { U.form.image = null; render(); },
  'new-request': () => { U.justCreated = null; render(); },
  'track-lead': (el) => { U.trackCode = lead(el.dataset.id).code; go('customer', 'track'); },
  'track-code': (el) => { U.trackCode = el.dataset.code; render(); },
  'as-pro': (el) => { const l = lead(el.dataset.id); const o = l.offers.find(o => o.status === 'pending'); if (o) S.proId = o.pid; save(); go('pro', 'requests'); toast(`מחוברים כעת כ${prov(S, S.proId).business} ${'(הדגמה)'}`); },
  'as-customer': (el) => { U.trackCode = lead(el.dataset.id).code; go('customer', 'track'); },
  'give-consent': (el) => { const l = lead(el.dataset.id); l.consent = true; log(l, 'הלקוח אישר העברת פרטים'); const r = intake(S, l); refresh(); toast(r.ok ? `נשלח ל־${r.count} בעלי מקצוע` : 'נשמר. אין כרגע התאמה'); },
  'approve-quote': (el) => { approveQuote(S, lead(el.dataset.id)); refresh(); toast('ההצעה אושרה. בעל המקצוע קיבל עדכון בממשק'); },
  'decline-quote': (el) => askConfirm('לדחות את ההצעה?', 'הבקשה תחזור להתאמה ותישלח לבעלי מקצוע אחרים.', 'דחיית ההצעה', () => {
    const l = lead(el.dataset.id); const pid = l.assignedTo; const o = l.offers.find(o => o.pid === pid); if (o) o.status = 'rejected';
    l.assignedTo = null; l.quote = null; log(l, 'הלקוח דחה את הצעת המחיר'); runMatch(S, l); refresh(); toast('ההצעה נדחתה. מחפשים בעל מקצוע אחר'); }),
  'rv-star': (el) => { U.rv = +el.dataset.n; document.querySelectorAll('#rv-stars .chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === U.rv))); },
  complain: (el) => openSheet('complain', el.dataset.id),
  'cust-cancel': (el) => askConfirm('לבטל את הבקשה?', 'בעלי המקצוע יקבלו הודעה בממשק שהבקשה בוטלה.', 'ביטול הבקשה', () => { const l = lead(el.dataset.id); l.offers.forEach(o => { if (o.status === 'pending') o.status = 'closed'; }); setStatus(S, l, 'cancelled'); log(l, 'בוטל ע״י הלקוח'); refresh(); toast('הבקשה בוטלה'); }),
  'confirm-yes': () => { const fn = U.confirm.fn; closeSheet(); fn(); },

  accept: (el) => { const l = lead(el.dataset.id); if (accept(S, l, S.proId)) { refresh(); toast('קיבלתם את העבודה. פרטי הלקוח זמינים בלשונית עבודות'); go('pro', 'jobs', false); } else { toast('העבודה כבר נלקחה ע״י בעל מקצוע אחר', true); refresh(); } },
  reject: (el) => openSheet('reject', el.dataset.id),
  'reject-yes': (el) => { reject(S, lead(el.dataset.id), S.proId, el.dataset.r); closeSheet(); refresh(); toast('הבקשה נדחתה והועברה הלאה'); },
  status: (el) => { setStatus(S, lead(el.dataset.id), el.dataset.s); refresh(); toast(el.dataset.s === 'completed' ? 'העבודה סומנה כהושלמה. אפשר לרשום תשלום' : 'העבודה התחילה'); },
  'pro-cancel': (el) => askConfirm('לבטל את העבודה?', 'ביטול פוגע בשיעור ההיענות שלכם, והלקוח יקבל עדכון.', 'ביטול העבודה', () => { const l = lead(el.dataset.id); const p = prov(S, l.assignedTo); p.acceptRate = clamp(p.acceptRate * 0.95); setStatus(S, l, 'cancelled'); log(l, 'בוטל ע״י בעל המקצוע'); refresh(); toast('העבודה בוטלה'); }),
  dispute: (el) => openSheet('dispute', el.dataset.id),
  pcat: (el) => { const p = me(), c = el.dataset.cat; p.cats = p.cats.includes(c) ? p.cats.filter(x => x !== c) : [...p.cats, c]; refresh(); },
  preg: (el) => { const p = me(), r = el.dataset.r; p.regions = p.regions.includes(r) ? p.regions.filter(x => x !== r) : [...p.regions, r]; refresh(); },
  'pcity-rm': (el) => { const p = me(); p.cities = p.cities.filter(x => x !== el.dataset.city); refresh(); },

  rematch: (el) => { const l = lead(el.dataset.id); const r = intake(S, l); refresh(); toast(r.ok ? `נשלח ל־${r.count} בעלי מקצוע` : 'לא נמצאה התאמה', !r.ok); },
  assign: (el) => { manualAssign(S, lead(el.dataset.id), el.dataset.pid); refresh(); toast('השיבוץ הידני בוצע'); },
  collect: (el) => { const l = lead(el.dataset.id); l.commission.status = 'collected'; log(l, `עמלה של ${ils2(commissionOf(S, l).amount)} סומנה כנגבתה (מדומה)`); refresh(); toast('העמלה סומנה כנגבתה'); },
  'dispute-keep': (el) => { const l = lead(el.dataset.id); l.commission.status = 'due'; log(l, 'הערעור על העמלה נדחה'); refresh(); toast('הערעור נדחה. העמלה חזרה לגבייה'); },
  'dispute-waive': (el) => { const l = lead(el.dataset.id); l.commission.status = 'waived'; log(l, 'העמלה בוטלה ביישוב מחלוקת'); refresh(); toast('העמלה בוטלה'); },
  'admin-cancel': (el) => askConfirm('לבטל את הליד?', 'אם התקבלו תשלומים, העמלה תחושב רק על מה ששולם בפועל.', 'ביטול', () => { const l = lead(el.dataset.id); l.offers.forEach(o => { if (o.status === 'pending') o.status = 'closed'; }); setStatus(S, l, 'cancelled'); log(l, 'בוטל ע״י מנהל'); refresh(); toast('הליד בוטל'); }),
  pv: (el) => { const p = prov(S, el.dataset.id), k = el.dataset.k; p[k] = !p[k]; refresh(); toast('נשמר'); },
  'clear-lf': () => { U.lf = { q: '', city: '', cat: '', status: '', from: '', to: '' }; render(); },
  'cust-leads': (el) => { U.lf = { q: el.dataset.phone, city: '', cat: '', status: '', from: '', to: '' }; go('admin', 'leads'); },
  'c-review': (el) => { S.complaints.find(c => c.id === el.dataset.id).status = 'in_review'; refresh(); },
  range: (el) => { U.rangeDays = +el.dataset.d; render(); },
  reset: () => askConfirm('לאפס את נתוני ההדגמה?', 'כל הבקשות, השינויים והתשלומים המדומים שיצרתם יימחקו מהדפדפן הזה.', 'איפוס', () => { resetDemo(); U.justCreated = null; go('admin', 'overview'); toast('נתוני ההדגמה אופסו'); }),
  ...GUIDE
};

document.addEventListener('click', (ev) => {
  const r = ev.target.closest('[data-role]');
  if (r && r.closest('.roles')) { go(r.dataset.role, TABS[r.dataset.role][0][0]); return; }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'SUMMARY') return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  ev.preventDefault();
  fn(el);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && U.sheet) closeSheet();
  if (ev.key === 'Enter' && ev.target.matches('tr[data-act]')) ACT[ev.target.dataset.act](ev.target);
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset.bind) { U.form[t.dataset.bind] = t.type === 'checkbox' ? t.checked : t.value; if (U.errors[t.dataset.bind]) { delete U.errors[t.dataset.bind]; t.classList.remove('err'); } }
  if (t.dataset.quote) { U.quoteDraft[t.dataset.quote] = t.value; const n = num(t.value); const o = document.getElementById('q-total-' + t.dataset.quote); if (o) o.textContent = isFinite(n) && n > 0 ? `כולל מע״מ: ${ils2(n * (1 + VAT))}` : 'הלקוח יראה את הסכום כולל מע״מ'; }
  if (t.dataset.pay) U.payDraft[t.dataset.pay] = t.value;
  if (t.dataset.pbind) { me()[t.dataset.pbind] = t.value; save(); }
  if (t.dataset.lf === 'q') { U.lf.q = t.value; const pos = t.selectionStart; render(); const n = document.getElementById('lf-q'); n.focus(); n.setSelectionRange(pos, pos); }
  if (t.dataset.pf === 'q') { U.pf.q = t.value; const pos = t.selectionStart; render(); const n = document.getElementById('pf-q'); n.focus(); n.setSelectionRange(pos, pos); }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.bind === 'consent') { U.form.consent = t.checked; render(); return; }
  if (t.dataset.bind === 'cat') { U.form.cat = t.value; delete U.errors.cat; render(); return; }
  if (t.dataset.bind === 'city') { U.form.city = t.value; delete U.errors.city; render(); return; }
  if (t.dataset.lf && t.dataset.lf !== 'q') { U.lf[t.dataset.lf] = t.value; render(); return; }
  if (t.dataset.pf && t.dataset.pf !== 'q') { U.pf[t.dataset.pf] = t.value; render(); return; }
  if (t.dataset.sim) { U.sim[t.dataset.sim] = t.value; render(); return; }
  if (t.id === 'pro-switch') { S.proId = t.value; save(); render(); toast(`מחוברים כעת כ${me().business}`); return; }
  if (t.id === 'avail-toggle') { me().available = t.checked; refresh(); toast(t.checked ? 'אתם זמינים לבקשות חדשות' : 'הזמינות כובתה'); return; }
  if (t.id === 'pf-addcity' && t.value) { const p = me(); if (!p.cities.includes(t.value)) p.cities.push(t.value); refresh(); return; }
  if (t.id === 'f-img' && t.files[0]) {
    const file = t.files[0];
    if (!file.type.startsWith('image/')) { toast('אפשר לצרף רק קובץ תמונה', true); return; }
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height)); const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      U.form.image = cv.toDataURL('image/jpeg', 0.72); render(); }; img.onerror = () => toast('לא הצלחנו לקרוא את התמונה. נסו קובץ JPG או PNG', true); img.src = rd.result; };
    rd.readAsDataURL(file);
  }
});

document.addEventListener('submit', (ev) => {
  const f = ev.target; ev.preventDefault();
  const id = f.dataset.id;
  switch (f.id) {
    case 'hero-search': {
      U.form.cat = document.getElementById('hs-cat').value; U.form.city = document.getElementById('hs-city').value; U.justCreated = null; go('customer', 'request'); break;
    }
    case 'req-form': {
      const F = U.form, e = {};
      if (!F.cat) e.cat = 'בחרו תחום';
      if (!F.city) e.city = 'בחרו עיר';
      if (F.desc.trim().length < 8) e.desc = 'כתבו לפחות כמה מילים על העבודה';
      if (!F.name.trim()) e.name = 'הזינו שם';
      if (!validPhone(F.phone)) e.phone = 'מספר טלפון ישראלי, לדוגמה 052-1234567';
      U.errors = e;
      if (Object.keys(e).length) { render(); const first = document.querySelector('.input.err'); if (first) first.focus(); toast('יש שדות שצריך להשלים', true); return; }
      U.submitting = true; render();
      setTimeout(() => {
        const l = { id: uid('l'), code: 'PN-' + (Math.max(...S.leads.map(x => +x.code.slice(3))) + 1), created: now(), demo: false,
          customer: { name: F.name.trim(), phone: F.phone.trim(), email: F.email.trim(), address: F.address.trim() },
          cat: F.cat, city: F.city, urgency: F.urgency, desc: F.desc.trim(), image: F.image, consent: F.consent,
          status: 'matched', offers: [], assignedTo: null, quote: null, payments: [], commission: { status: 'none' }, review: null,
          history: [{ at: now(), text: 'הבקשה נקלטה במערכת' }] };
        S.leads.push(l); intake(S, l);
        S.demoLeadId = l.id; S.adminSawDemo = false;
        U.submitting = false; U.justCreated = l.id;
        U.form = { cat: '', city: '', urgency: 'soon', desc: '', image: null, name: '', phone: '', email: '', address: '', consent: true };
        refresh(); window.scrollTo(0, 0);
      }, 700);
      break;
    }
    case 'track-form': U.trackCode = document.getElementById('t-code').value; render(); break;
    case 'fix-form': {
      const l = lead(id); l.customer.name = document.getElementById('fx-name').value.trim(); l.customer.phone = document.getElementById('fx-phone').value.trim(); l.desc = document.getElementById('fx-desc').value.trim();
      const r = intake(S, l); refresh(); toast(r.ok ? `הפרטים הושלמו. נשלח ל־${r.count} בעלי מקצוע` : r.reason === 'missing' ? 'עדיין חסרים: ' + r.miss.join(', ') : 'נשמר', !r.ok); break;
    }
    case 'review-form': {
      const l = lead(id), p = prov(S, l.assignedTo); const txt = document.getElementById('rv-text').value.trim() || 'ללא פירוט';
      l.review = { stars: U.rv || 5, text: txt, at: now() };
      p.reviews.push({ who: maskName(l.customer.name), stars: l.review.stars, text: txt, at: now() });
      p.rating = +(p.reviews.reduce((a, r) => a + r.stars, 0) / p.reviews.length).toFixed(1);
      log(l, `הלקוח דירג ${l.review.stars} כוכבים`); U.rv = 5; refresh(); toast('תודה! חוות הדעת פורסמה'); break;
    }
    case 'complain-form': {
      const txt = document.getElementById('cp-text').value.trim(); if (!txt) { toast('תארו בקצרה מה קרה', true); return; }
      S.complaints.push({ id: uid('c'), leadId: id, from: 'customer', type: document.getElementById('cp-type').value, text: txt, status: 'open', at: now() });
      log(lead(id), 'הלקוח פתח דיווח על בעיה'); closeSheet(); refresh(); toast('הדיווח התקבל. צוות PRO NETWORK יחזור אליכם'); break;
    }
    case 'quote-form': {
      const n = num(document.getElementById('q-amt-' + id).value);
      if (!(n > 0)) { toast('הזינו סכום גדול מאפס', true); return; }
      submitQuote(S, lead(id), n, document.getElementById('q-note-' + id).value.trim()); delete U.quoteDraft[id]; refresh(); toast('הצעת המחיר נשלחה ללקוח'); break;
    }
    case 'pay-form': {
      const n = num(document.getElementById('pay-amt-' + id).value);
      if (!(n > 0)) { toast('הזינו סכום תשלום', true); return; }
      addPayment(S, lead(id), 'payment', n, document.getElementById('pay-method-' + id).value); delete U.payDraft[id]; refresh();
      const c = commissionOf(S, lead(id)); toast(`תשלום מדומה נרשם. עמלה: ${ils2(c.amount)}`); break;
    }
    case 'refund-form': {
      const l = lead(id), n = num(document.getElementById('rf-amt').value);
      if (!(n > 0) || n > payInfo(l).net + 0.01) { toast('סכום ההחזר חייב להיות גדול מאפס ולא יותר ממה ששולם', true); return; }
      addPayment(S, l, 'refund', n, 'החזר ללקוח'); refresh(); toast('ההחזר נרשם והעמלה חושבה מחדש'); break;
    }
    case 'dispute-form': {
      const txt = document.getElementById('dp-text').value.trim(); if (!txt) { toast('כתבו נימוק', true); return; }
      const l = lead(id); l.commission.status = 'disputed'; l.commission.dispute = txt; l.commission.disputeAt = now(); log(l, 'בעל המקצוע ערער על העמלה'); closeSheet(); refresh(); toast('הערעור נשלח לבדיקה'); break;
    }
    case 'dispute-resolve': {
      const l = lead(id), n = num(document.getElementById('dr-rate').value);
      if (!(n >= 0 && n <= 20)) { toast('הזינו שיעור בין 0 ל־20', true); return; }
      l.commission.rateOverride = n; l.commission.status = 'due'; log(l, `המחלוקת יושבה: שיעור עמלה עודכן ל־${n}%`); refresh(); toast('השיעור עודכן והעמלה חזרה לגבייה'); break;
    }
    case 'agreement-form': {
      const v = document.getElementById('ag-rate').value.trim(); const p = prov(S, id);
      if (v === '') p.agreementRate = null; else { const n = num(v); if (!(n >= 1 && n <= 20)) { toast('שיעור בין 1 ל־20, או ריק לתעריף קטגוריה', true); return; } p.agreementRate = n; }
      refresh(); toast('הסכם העמלה נשמר'); break;
    }
    case 'rates-form': {
      let bad = null;
      f.querySelectorAll('input[name]').forEach(inp => { const n = num(inp.value); if (!(n >= +inp.dataset.min && n <= +inp.dataset.max)) bad = bad || inp; });
      if (bad) { bad.classList.add('err'); bad.focus(); toast(`השיעור חייב להיות בטווח ${bad.dataset.min}–${bad.dataset.max}%`, true); return; }
      f.querySelectorAll('input[name]').forEach(inp => { if (inp.name === 'large') S.largeRate = num(inp.value); else S.catRates[inp.name] = num(inp.value); });
      refresh(); toast('התעריפים נשמרו'); break;
    }
    case 'cr-form': {
      const c = S.complaints.find(x => x.id === id); const txt = document.getElementById('cr-' + id).value.trim();
      if (!txt) { toast('כתבו סיכום טיפול לפני סגירה', true); return; }
      c.status = 'resolved'; c.resolution = txt; refresh(); toast('התלונה נסגרה'); break;
    }
  }
});

window.addEventListener('hashchange', () => { fromHash(); render(); });
window.addEventListener('resize', () => drawHeroMap());

/* boot */
S = load();
fromHash();
render();
