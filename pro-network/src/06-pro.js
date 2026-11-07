/* ============================================================
   Professional views
   ============================================================ */
const me = () => prov(S, S.proId);
const myOffers = () => S.leads.filter(l => l.offers.some(o => o.pid === S.proId));
const myJobs = () => S.leads.filter(l => l.assignedTo === S.proId);

function proHeader() {
  const p = me();
  const warn = [];
  if (!p.approved) warn.push('החשבון ממתין לאישור מנהל, ולכן לא תקבלו בקשות.');
  if (!p.active) warn.push('החשבון מושעה. פנו לצוות PRO NETWORK.');
  if (p.cats.some(c => CAT[c].license) && !p.licenseVerified) warn.push('הרישיון שלכם טרם אומת. בקשות בתחומים שמחייבים רישיון לא יישלחו אליכם.');
  return `<div class="card row" style="gap:12px">
    <span class="avatar">${initials(p.name)}</span>
    <div class="grow"><div class="label">מחובר/ת כ־ ${SIM}</div>
      <select class="input" id="pro-switch" aria-label="החלפת בעל מקצוע להדגמה" style="min-height:40px;margin-top:4px;font-weight:500">${S.providers.map(x => opt(x.id, `${x.business} · ${x.name}`, x.id === p.id)).join('')}</select></div>
  </div>${warn.map(w => notice('warn', 'alert', esc(w))).join('')}`;
}
function earningsOf(pid) {
  const jobs = S.leads.filter(l => l.assignedTo === pid);
  let gross = 0, ex = 0, comm = 0;
  jobs.forEach(l => { const c = commissionOf(S, l); gross += c.pay.net; ex += c.base; comm += c.amount; });
  return { gross, ex, comm, net: ex - comm, jobs };
}

VIEWS.pro.home = () => {
  const p = me(), e = earningsOf(p.id);
  const pend = myOffers().filter(l => l.offers.find(o => o.pid === p.id).status === 'pending' && !l.assignedTo);
  const active = myJobs().filter(l => ['accepted','quoted','approved','in_progress','completed'].includes(l.status));
  return `<div class="stack">${proHeader()}
    <div class="card row between">
      <div class="grow"><h3>${p.available ? 'זמין לעבודות חדשות' : 'לא זמין כרגע'}</h3><p class="small muted">${p.available ? `תור פנוי הבא: בעוד ${p.nextSlotH < 24 ? p.nextSlotH + ' שעות' : Math.round(p.nextSlotH / 24) + ' ימים'}` : 'לא נשלח אליכם בקשות עד שתחזרו לזמינות.'}</p></div>
      <label class="switch" aria-label="זמינות"><input type="checkbox" id="avail-toggle"${p.available ? ' checked' : ''}><span></span></label>
    </div>
    <div class="kpis">
      ${kpi('בקשות חדשות', pend.length)}
      ${kpi('עבודות פעילות', active.length)}
      ${kpi('הכנסה נטו', ils(e.net), 'אחרי עמלה, לפני מע״מ')}
      ${kpi('דירוג', `${p.rating} <span class="small muted">/ 5</span>`, `${p.reviews.length} חוות דעת`)}
    </div>
    <div class="card stack"><div class="section-h"><h2>בקשות שמחכות לכם</h2><button class="btn ghost sm" data-act="tab" data-tab="requests">לכל הבקשות</button></div>
      ${pend.length ? pend.slice(0, 3).map(l => offerCard(l, true)).join('') : empty('inbox', 'אין בקשות חדשות', p.available ? 'בקשות מתאימות יופיעו כאן.' : 'הפעילו זמינות כדי לקבל בקשות.')}</div>
    <div class="card stack"><h2>ביצועים</h2>
      <div class="score"><span>שיעור היענות</span><div class="bar"><i style="width:${p.acceptRate * 100}%"></i></div><span class="num">${pct(p.acceptRate)}</span>
      <span>איכות שירות</span><div class="bar"><i style="width:${p.rating / 5 * 100}%"></i></div><span class="num">${p.rating}</span>
      <span>עבודות שהושלמו</span><div class="bar"><i style="width:${Math.min(100, e.jobs.filter(l => ['completed','closed'].includes(l.status)).length * 20)}%"></i></div><span class="num">${e.jobs.filter(l => ['completed','closed'].includes(l.status)).length}</span></div>
      <p class="xs muted">המדדים האלה משפיעים על הדירוג שלכם במנוע ההתאמה.</p></div>
  </div>`;
};

function offerCard(l, compact) {
  const o = l.offers.find(o => o.pid === S.proId);
  const row = evaluate(S, l).find(r => r.p.id === S.proId);
  const pending = o.status === 'pending' && !l.assignedTo;
  return `<div class="card stack" style="${compact ? 'padding:12px;background:var(--surface-2);border-color:transparent' : ''}">
    <div class="row between"><div class="row" style="gap:8px"><span class="ic" style="color:var(--teal-ink)">${icon(CAT[l.cat].icon, 20)}</span><h3>${CAT[l.cat].name} · ${esc(l.city)}</h3></div>
      ${pending ? pill(URGENCY[l.urgency].name, l.urgency === 'now' ? 'bad' : 'info') : pill({ accepted: 'קיבלתם', rejected: 'דחיתם', closed: 'נלקחה ע״י אחר' }[o.status] || o.status, o.status === 'accepted' ? 'ok' : 'plain')}</div>
    <p class="small">${esc(l.desc)}</p>
    ${l.image ? `<img src="${l.image}" alt="תמונה מהלקוח" style="border-radius:10px;max-height:140px;object-fit:cover;align-self:flex-start">` : ''}
    <div class="row xs muted"><span>${icon('user', 14)} ${esc(maskName(l.customer.name))} · <span class="ltr">${esc(maskPhone(l.customer.phone))}</span></span><span>${ago(l.created)}</span>${l.demo ? SIM : ''}</div>
    ${pending && row && row.parts ? `<details class="xs"><summary class="muted" style="cursor:pointer">למה קיבלתם את הבקשה? ציון התאמה <b class="num">${Math.round(row.score * 100)}</b></summary><div class="score" style="margin-top:8px">${Object.keys(WEIGHTS).map(k => `<span>${WEIGHT_NAMES[k]} · ${pct(WEIGHTS[k])}</span><div class="bar"><i style="width:${row.parts[k] * 100}%"></i></div><span class="num">${Math.round(row.parts[k] * 100)}</span>`).join('')}</div></details>` : ''}
    ${pending ? `<div class="notice info" style="padding:8px 10px">${icon('lock', 16)}<span class="xs">פרטי הלקוח המלאים ייחשפו אחרי שתקבלו את העבודה.</span></div>
      <div class="grid" style="grid-template-columns:2fr 1fr"><button class="btn" data-act="accept" data-id="${l.id}">${icon('check', 18)} קבלת העבודה</button><button class="btn ghost" data-act="reject" data-id="${l.id}">דחייה</button></div>` : ''}
  </div>`;
}

VIEWS.pro.requests = () => {
  const all = myOffers().sort((a, b) => b.created - a.created);
  const pend = all.filter(l => l.offers.find(o => o.pid === S.proId).status === 'pending' && !l.assignedTo);
  const past = all.filter(l => !pend.includes(l));
  return `<div class="stack">${proHeader()}
    <h2>בקשות חדשות <span class="muted num">(${pend.length})</span></h2>
    ${pend.length ? `<div class="grid g2">${pend.map(l => offerCard(l)).join('')}</div>` : `<div class="card">${empty('inbox', 'אין בקשות שממתינות לתשובה', 'כשלקוח באזור השירות שלכם יפתח בקשה בתחום שלכם, היא תופיע כאן.')}</div>`}
    ${past.length ? `<h2>בקשות קודמות</h2><div class="grid g2">${past.slice(0, 8).map(l => offerCard(l, false)).join('')}</div>` : ''}
  </div>`;
};

function jobCard(l) {
  const pay = payInfo(l), c = commissionOf(S, l);
  const qd = U.quoteDraft[l.id] ?? '';
  let act = '';
  switch (l.status) {
    case 'accepted':
      act = `<form class="stack" id="quote-form" data-id="${l.id}">
        <label class="field"><span>סכום הצעה לפני מע״מ (₪)</span><input class="input num" id="q-amt-${l.id}" data-quote="${l.id}" inputmode="decimal" value="${esc(qd)}" placeholder="לדוגמה 850"></label>
        <div class="small muted num" id="q-total-${l.id}">${qd ? `כולל מע״מ: ${ils2(+qd * (1 + VAT))}` : 'הלקוח יראה את הסכום כולל מע״מ'}</div>
        <label class="field"><span>פירוט (לא חובה)</span><input class="input" id="q-note-${l.id}" placeholder="מה כלול בהצעה"></label>
        <button class="btn" type="submit">שליחת הצעת מחיר</button></form>`; break;
    case 'quoted':
      act = `${notice('info', 'clock', `הצעה של ${ils(l.quote.amount)} + מע״מ ממתינה לאישור הלקוח.`)}<button class="btn ghost sm" data-act="as-customer" data-id="${l.id}">הדגמה: לעבור לממשק הלקוח ולאשר</button>`; break;
    case 'approved':
      act = `<button class="btn" data-act="status" data-s="in_progress" data-id="${l.id}">${icon('play', 18)} התחלת העבודה</button>`; break;
    case 'in_progress':
      act = `<button class="btn" data-act="status" data-s="completed" data-id="${l.id}">${icon('check', 18)} סימון העבודה כהושלמה</button>`; break;
    case 'completed':
      act = payForm(l); break;
  }
  const canCancel = ['accepted','quoted','approved'].includes(l.status);
  return `<div class="card stack">
    <div class="row between"><div><div class="label ltr num">${l.code}</div><h3>${CAT[l.cat].name} · ${esc(l.city)}</h3></div>${statusPill(l.status)}</div>
    <div class="small" style="background:var(--surface-2);border-radius:10px;padding:10px">
      <div><b>${esc(l.customer.name)}</b> ${l.demo ? SIM : ''}</div>
      <div class="ltr num">${esc(l.customer.phone)}</div>
      ${l.customer.address ? `<div>${esc(l.customer.address)}</div>` : ''}
    </div>
    <p class="small">${esc(l.desc)}</p>
    ${l.quote ? `<div class="calc small num"><span>הצעה (לפני מע״מ)</span><span>${ils2(l.quote.amount)}</span><span>שולם (כולל מע״מ)</span><span>${ils2(pay.net)} ${payPill(pay.state)}</span>${c.amount ? `<span>עמלת PRO NETWORK · ${c.rate}%</span><span>${ils2(c.amount)}</span>` : ''}</div>` : ''}
    ${act}
    <div class="row">${canCancel ? `<button class="btn danger sm" data-act="pro-cancel" data-id="${l.id}">ביטול העבודה</button>` : ''}
    ${['accruing','due'].includes(l.commission.status) ? `<button class="btn ghost sm" data-act="dispute" data-id="${l.id}">ערעור על העמלה</button>` : ''}</div>
  </div>`;
}
function payForm(l) {
  const pay = payInfo(l);
  const d = U.payDraft[l.id] ?? (pay.balance ? (Math.round(pay.balance * 100) / 100).toString() : '');
  return `<form class="stack" id="pay-form" data-id="${l.id}" style="border-top:1px solid var(--line);padding-top:12px">
    <div class="row between"><h3>רישום תשלום מהלקוח</h3>${SIM}</div>
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <label class="field"><span>סכום כולל מע״מ</span><input class="input num" id="pay-amt-${l.id}" data-pay="${l.id}" inputmode="decimal" value="${esc(d)}"></label>
      <label class="field"><span>אמצעי</span><select class="input" id="pay-method-${l.id}">${['העברה בנקאית','ביט','כרטיס אשראי','מזומן','צ׳ק'].map(m => opt(m, m)).join('')}</select></label>
    </div>
    <div class="xs muted">יתרה לפי ההצעה: ${ils2(pay.balance)}. אפשר לרשום תשלום חלקי. התשלום מדומה ולא עובר כסף.</div>
    <button class="btn" type="submit">רישום תשלום מדומה</button></form>`;
}

VIEWS.pro.jobs = () => {
  const jobs = myJobs().sort((a, b) => b.created - a.created);
  const active = jobs.filter(l => !['closed','cancelled'].includes(l.status));
  const done = jobs.filter(l => ['closed','cancelled'].includes(l.status));
  return `<div class="stack">${proHeader()}
    <h2>עבודות פעילות <span class="muted num">(${active.length})</span></h2>
    ${active.length ? `<div class="grid g2">${active.map(jobCard).join('')}</div>` : `<div class="card">${empty('brief', 'אין עבודות פעילות', 'עבודות שתקבלו יופיעו כאן עם פרטי הלקוח המלאים.')}</div>`}
    ${done.length ? `<h2>הסתיימו</h2><div class="grid g2">${done.map(jobCard).join('')}</div>` : ''}
  </div>`;
};

VIEWS.pro.earnings = () => {
  const p = me(), e = earningsOf(p.id);
  const rows = e.jobs.filter(l => l.payments.length || l.commission.status !== 'none').sort((a, b) => b.created - a.created);
  return `<div class="stack">${proHeader()}
    <div class="kpis">
      ${kpi('התקבל מלקוחות', ils(e.gross), 'כולל מע״מ')}
      ${kpi('בסיס לעמלה', ils(e.ex), 'לפני מע״מ')}
      ${kpi('עמלות PRO NETWORK', ils(e.comm))}
      ${kpi('נטו לכם', ils(e.net), 'לפני מע״מ')}
    </div>
    ${notice('info', 'percent', `העמלה מחושבת רק על כסף שהתקבל בפועל, אחרי החזרים ובלי מע״מ. ${p.agreementRate != null ? `יש לכם הסכם אישי: <b>${p.agreementRate}%</b>.` : 'התעריף נקבע לפי תחום העבודה.'}`)}
    <div class="card"><h2>היסטוריית עמלות</h2>
    ${rows.length ? `<div class="tbl-wrap cards-wrap" style="margin-top:10px"><table class="tbl cards"><thead><tr><th>עבודה</th><th>תאריך</th><th>בסיס</th><th>שיעור</th><th>עמלה</th><th>סטטוס</th></tr></thead><tbody>
      ${rows.map(l => { const c = commissionOf(S, l); return `<tr><td data-l="עבודה"><span class="ltr num">${l.code}</span> · ${CAT[l.cat].name}</td><td data-l="תאריך" class="num">${fdate(l.created)}</td><td data-l="בסיס" class="num">${ils2(c.base)}</td><td data-l="שיעור" class="num">${c.rate}%</td><td data-l="עמלה" class="num"><b>${ils2(c.amount)}</b></td><td data-l="סטטוס">${commPill(l.commission.status)}</td></tr>`; }).join('')}
    </tbody></table></div>` : empty('wallet', 'עוד אין תשלומים', 'אחרי שתרשמו תשלום מלקוח, העמלה תופיע כאן.')}</div>
  </div>`;
};

VIEWS.pro.profile = () => {
  const p = me();
  return `<div class="stack">${proHeader()}
    <div class="card stack"><h2>פרטי העסק</h2>
      <div class="grid g2">
        <label class="field"><span>שם העסק</span><input class="input" id="pf-business" data-pbind="business" value="${esc(p.business)}"></label>
        <label class="field"><span>טלפון</span><input class="input" id="pf-phone" data-pbind="phone" value="${esc(p.phone)}" dir="ltr" style="text-align:right"></label>
      </div>
      <div class="row small">${p.approved ? pill('מאושר', 'ok') : pill('ממתין לאישור', 'warn')} ${p.licenseVerified ? pill('רישיון אומת', 'ok') : pill('רישיון לא אומת', 'warn')} ${pill(p.agreementRate != null ? `הסכם אישי ${p.agreementRate}%` : 'תעריף לפי קטגוריה', 'plain')}</div>
    </div>
    <div class="card stack"><h2>תחומי שירות</h2><div class="chips">${CATS.map(c => `<button class="chip" data-act="pcat" data-cat="${c.id}" aria-pressed="${p.cats.includes(c.id)}">${c.name}${c.license ? '<small>דורש רישיון</small>' : ''}</button>`).join('')}</div></div>
    <div class="card stack"><h2>אזורי שירות</h2>
      <p class="small muted">אזור שלם מקבל ציון קרבה חלקי. עיר שבחרתם במפורש מקבלת ציון מלא.</p>
      <div class="label">אזורים שלמים</div>
      <div class="chips">${Object.entries(REGIONS).map(([k, n]) => `<button class="chip" data-act="preg" data-r="${k}" aria-pressed="${p.regions.includes(k)}">${n}</button>`).join('')}</div>
      <div class="label">ערים</div>
      <div class="chips">${p.cities.map(c => `<button class="chip" data-act="pcity-rm" data-city="${esc(c)}" aria-pressed="true">${esc(c)} ✕</button>`).join('')}</div>
      <select class="input" id="pf-addcity">${cityOptions('', 'הוספת עיר…')}</select>
    </div>
    <div class="card"><h2>חוות דעת</h2>${p.reviews.length ? [...p.reviews].sort((a, b) => b.at - a.at).map(r => `<div class="item"><div class="grow"><div class="row between"><b class="small">${esc(r.who)}</b>${stars(r.stars)}</div><p class="small">${esc(r.text)}</p><div class="xs muted">${fdate(r.at)}</div></div></div>`).join('') : empty('star', 'עוד אין חוות דעת')}</div>
  </div>`;
};

SHEETS.reject = (id) => ({ title: 'דחיית הבקשה', body: `<div class="stack"><p class="small muted">הבקשה תעבור לבעל המקצוע הבא בתור. דחיות תכופות מורידות את שיעור ההיענות שלכם.</p>
  <div class="menu-list">${['לא פנוי בזמן המבוקש','רחוק מדי','לא בתחום שלי','אחר'].map(r => `<button data-act="reject-yes" data-id="${id}" data-r="${r}">${esc(r)}</button>`).join('')}</div></div>` });
SHEETS.dispute = (id) => ({ title: 'ערעור על עמלה', body: `<form id="dispute-form" data-id="${id}" class="stack"><p class="small muted">העמלה תוקפא עד שמנהל יבדוק את הערעור.</p>
  <label class="field"><span>נימוק</span><textarea class="input" id="dp-text" required placeholder="לדוגמה: חלק מהסכום הוא החזר על חומרים שהלקוח רכש"></textarea></label><button class="btn" type="submit">שליחת ערעור</button></form>` });
