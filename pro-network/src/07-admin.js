/* ============================================================
   Admin views
   ============================================================ */
const within = (l, days) => !days || l.created >= now() - days * DAY;

VIEWS.admin.overview = () => {
  const L = S.leads;
  const comm = L.map(l => commissionOf(S, l));
  const turnover = comm.reduce((a, c) => a + c.pay.net, 0);
  const commTotal = comm.reduce((a, c) => a + c.amount, 0);
  const collected = L.reduce((a, l, i) => a + (l.commission.status === 'collected' ? comm[i].amount : 0), 0);
  const activeJobs = L.filter(l => ['accepted','quoted','approved','in_progress'].includes(l.status)).length;
  const provActive = S.providers.filter(p => p.approved && p.active).length;
  const attention = [
    ...L.filter(l => l.status === 'unmatched').map(l => ['bad', `ליד <span class="ltr num">${l.code}</span> ללא התאמה · ${CAT[l.cat].name}, ${esc(l.city)}`, 'lead', l.id]),
    ...L.filter(l => l.status === 'pending_info').map(l => ['warn', `ליד <span class="ltr num">${l.code}</span> חסר פרטים: ${esc(missingFields(l).join(', '))}`, 'lead', l.id]),
    ...L.filter(l => l.status === 'no_consent').map(l => ['warn', `ליד <span class="ltr num">${l.code}</span> ממתין להסכמת לקוח`, 'lead', l.id]),
    ...S.providers.filter(p => !p.approved).map(p => ['info', `${esc(p.business)} ממתין לאישור הצטרפות`, 'provider', p.id]),
    ...L.filter(l => l.commission.status === 'disputed').map(l => ['bad', `מחלוקת עמלה בעבודה <span class="ltr num">${l.code}</span>`, 'lead', l.id]),
    ...S.complaints.filter(c => c.status !== 'resolved').map(c => ['warn', `תלונה פתוחה: ${esc(c.type)} · <span class="ltr num">${lead(c.leadId).code}</span>`, 'complaint', c.id])
  ];
  const funnel = FLOW.map(s => [s, L.filter(l => FLOW.indexOf(l.status) >= FLOW.indexOf(s)).length]);
  const fmax = Math.max(1, ...funnel.map(f => f[1]));
  const byCat = CATS.map(c => [c, L.filter(l => l.cat === c.id).reduce((a, l) => a + commissionOf(S, l).amount, 0)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const cmax = Math.max(1, ...byCat.map(x => x[1]));
  return `<div class="stack">
    <div class="section-h"><div><h1 style="font-size:26px">לוח בקרה</h1><p class="small muted">כל הנתונים מדומים לצורך הדגמה</p></div><button class="btn ghost sm" data-act="reset">איפוס נתוני הדגמה</button></div>
    <div class="kpis">
      ${kpi('לידים', L.length, `${L.filter(l => within(l, 7)).length} בשבוע האחרון`)}
      ${kpi('עבודות פעילות', activeJobs, `${L.filter(l => ['completed','closed'].includes(l.status)).length} הושלמו`)}
      ${kpi('בעלי מקצוע פעילים', provActive, `${S.providers.filter(p => !p.approved).length} ממתינים לאישור`)}
      ${kpi('מחזור עסקאות', ils(turnover), 'כולל מע״מ, נטו מהחזרים')}
      ${kpi('עמלות שנצברו', ils(commTotal), `${ils(collected)} נגבו`)}
      ${kpi('שיעור סגירה', pct(L.filter(l => ['completed','closed'].includes(l.status)).length / Math.max(1, L.length)), 'לידים שהגיעו לסיום')}
      ${kpi('תלונות פתוחות', S.complaints.filter(c => c.status !== 'resolved').length)}
      ${kpi('מחלוקות עמלה', L.filter(l => l.commission.status === 'disputed').length)}
    </div>
    <div class="grid g2">
      <div class="card stack"><h2>דורש טיפול <span class="muted num">(${attention.length})</span></h2>
        ${attention.length ? `<div>${attention.map(([t, txt, type, id]) => `<button class="item" style="width:100%;border-inline:0;border-top:0;background:none;text-align:start;cursor:pointer" data-act="open" data-type="${type}" data-id="${id}"><span class="pill ${t} plain" style="padding:4px">${icon(t === 'info' ? 'user' : 'alert', 14)}</span><span class="small grow">${txt}</span></button>`).join('')}</div>` : empty('check', 'הכל מטופל')}</div>
      <div class="card stack"><h2>משפך עבודות</h2><div class="hbars">${funnel.map(([s, n]) => `<div class="hbar"><span>${STATUS[s].name}</span><div class="bar"><i style="width:${n / fmax * 100}%"></i></div><span class="num">${n}</span></div>`).join('')}</div></div>
      <div class="card stack"><h2>עמלות לפי תחום</h2>${byCat.length ? `<div class="hbars">${byCat.map(([c, v]) => `<div class="hbar"><span>${c.name}</span><div class="bar"><i style="width:${v / cmax * 100}%"></i></div><span class="num">${ils(v)}</span></div>`).join('')}</div>` : empty('chart', 'עוד אין עמלות')}</div>
    </div>
  </div>`;
};

function filteredLeads() {
  const f = U.lf, q = f.q.trim().toLowerCase();
  return S.leads.filter(l =>
    (!f.city || l.city === f.city) && (!f.cat || l.cat === f.cat) && (!f.status || l.status === f.status) &&
    (!f.from || l.created >= new Date(f.from).getTime()) && (!f.to || l.created <= new Date(f.to).getTime() + DAY) &&
    (!q || [l.code, l.customer.name, l.customer.phone, l.desc].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => b.created - a.created);
}
VIEWS.admin.leads = () => {
  const f = U.lf, rows = filteredLeads();
  return `<div class="stack">
    <div class="section-h"><h1 style="font-size:26px">ניהול לידים</h1><span class="small muted num">${rows.length} מתוך ${S.leads.length}</span></div>
    <div class="filters">
      <input class="input" id="lf-q" data-lf="q" placeholder="חיפוש: מספר, שם, טלפון" value="${esc(f.q)}" style="grid-column:1/-1" >
      <select class="input" id="lf-city" data-lf="city">${cityOptions(f.city, 'כל הערים')}</select>
      <select class="input" id="lf-cat" data-lf="cat">${catOptions(f.cat, 'כל התחומים')}</select>
      <select class="input" id="lf-status" data-lf="status"><option value="">כל הסטטוסים</option>${Object.entries(STATUS).map(([k, s]) => opt(k, s.name, k === f.status)).join('')}</select>
      <input class="input" type="date" id="lf-from" data-lf="from" value="${esc(f.from)}" aria-label="מתאריך">
      <input class="input" type="date" id="lf-to" data-lf="to" value="${esc(f.to)}" aria-label="עד תאריך">
    </div>
    ${Object.values(f).some(Boolean) ? `<button class="btn ghost sm" data-act="clear-lf" style="align-self:flex-start">ניקוי סינון</button>` : ''}
    ${rows.length ? `<div class="tbl-wrap cards-wrap"><table class="tbl cards"><thead><tr><th>מספר</th><th>נפתח</th><th>תחום</th><th>עיר</th><th>לקוח</th><th>בעל מקצוע</th><th>שווי</th><th>סטטוס</th></tr></thead><tbody>
      ${rows.map(l => { const p = l.assignedTo && prov(S, l.assignedTo); return `<tr class="click" data-act="open" data-type="lead" data-id="${l.id}" tabindex="0">
        <td data-l=""><b class="ltr num">${l.code}</b>${l.urgency === 'now' ? ' ' + pill('דחוף', 'bad') : ''}</td><td data-l="נפתח" class="num">${fdate(l.created)}</td><td data-l="תחום">${CAT[l.cat].name}</td><td data-l="עיר">${esc(l.city)}</td>
        <td data-l="לקוח">${esc(l.customer.name || '—')}</td><td data-l="בעל מקצוע">${p ? esc(p.business) : `<span class="muted">${l.offers.filter(o => o.status === 'pending').length ? l.offers.filter(o => o.status === 'pending').length + ' הצעות פתוחות' : '—'}</span>`}</td>
        <td data-l="שווי" class="num">${l.quote ? ils(l.quote.amount) : '—'}</td><td data-l="סטטוס">${statusPill(l.status)}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="card">${empty('search', 'אין לידים שתואמים לסינון', 'נסו להסיר חלק מהמסננים.')}</div>`}
  </div>`;
};

function matchTable(l, allowAssign) {
  const rows = evaluate(S, l);
  const elig = rows.filter(r => !r.fails.length), not = rows.filter(r => r.fails.length && r.p.cats.includes(l.cat));
  return `<div class="stack">
    ${elig.length ? elig.map((r, i) => { const o = l.offers.find(o => o.pid === r.p.id); return `<div class="card flat stack" style="padding:12px">
      <div class="row between"><div><b>${i + 1}. ${esc(r.p.business)}</b><div class="xs muted">${r.inCity ? 'משרת את העיר' : 'משרת את האזור'} · ${stars(r.p.rating)}</div></div><div style="text-align:center"><div class="num" style="font-family:var(--f-display);font-size:22px;font-weight:600">${Math.round(r.score * 100)}</div><div class="xs muted">ציון</div></div></div>
      <div class="score">${Object.keys(WEIGHTS).map(k => `<span>${WEIGHT_NAMES[k]} <span class="muted">${pct(WEIGHTS[k])}</span></span><div class="bar"><i style="width:${r.parts[k] * 100}%"></i></div><span class="num">${(WEIGHTS[k] * r.parts[k] * 100).toFixed(1)}</span>`).join('')}</div>
      <div class="row">${o ? pill({ pending: 'הבקשה אצלו', accepted: 'שובץ', rejected: 'דחה', closed: 'נסגר' }[o.status], o.status === 'accepted' ? 'ok' : o.status === 'rejected' ? 'bad' : 'info') : ''}
      ${allowAssign && !l.assignedTo ? `<button class="btn sm" data-act="assign" data-id="${l.id}" data-pid="${r.p.id}">שיבוץ ידני</button>` : ''}</div></div>`; }).join('') : notice('bad', 'alert', 'אין בעל מקצוע שעומד בכל תנאי הסף. בדקו ספקים לא זמינים או שטרם אושרו ברשימה למטה.')}
    ${not.length ? `<details><summary class="small muted" style="cursor:pointer">בעלי מקצוע בתחום שלא עמדו בתנאי הסף (${not.length})</summary><div style="margin-top:8px">${not.map(r => `<div class="item small"><span class="grow">${esc(r.p.business)}</span><span class="row" style="gap:4px">${r.fails.map(f => pill(f, 'bad')).join('')}</span></div>`).join('')}</div></details>` : ''}
  </div>`;
}

SHEETS.lead = (id) => {
  const l = lead(id);
  if (l.id === S.demoLeadId && !S.adminSawDemo) { S.adminSawDemo = true; save(); setTimeout(renderFab, 0); }
  const p = l.assignedTo && prov(S, l.assignedTo);
  const c = commissionOf(S, l), pay = c.pay;
  const miss = missingFields(l);
  return { title: `<span class="ltr num">${l.code}</span> · ${CAT[l.cat].name}`, body: `<div class="stack">
    <div class="row between">${statusPill(l.status)} ${l.demo ? SIM : ''}</div>
    <div class="card stack"><h3>פרטי הבקשה</h3>
      <div class="calc small"><span class="muted">לקוח</span><span>${esc(l.customer.name || '—')}</span><span class="muted">טלפון</span><span class="ltr num">${esc(l.customer.phone)}</span><span class="muted">עיר</span><span>${esc(l.city)} · ${REGIONS[CITY_REGION[l.city]]}</span><span class="muted">כתובת</span><span>${esc(l.customer.address || '—')}</span><span class="muted">דחיפות</span><span>${URGENCY[l.urgency].name}</span><span class="muted">הסכמה לשיתוף</span><span>${l.consent ? pill('ניתנה', 'ok') : pill('לא ניתנה', 'warn')}</span></div>
      <p class="small">${esc(l.desc)}</p>${l.image ? `<img src="${l.image}" alt="תמונה מהלקוח" style="border-radius:10px;max-height:180px;object-fit:cover">` : ''}
      ${miss.length ? notice('warn', 'alert', 'חסרים פרטי חובה: ' + esc(miss.join(', ')) + '. המערכת לא תשבץ את הליד עד להשלמה.') : ''}
      ${!l.consent ? notice('warn', 'lock', 'אין הסכמת לקוח. המערכת לא תעביר את הליד לבעלי מקצוע.') : ''}
    </div>
    <div class="card stack"><div class="row between"><h3>התאמה</h3>${!p && l.consent && !miss.length && !['cancelled','closed'].includes(l.status) ? `<button class="btn ghost sm" data-act="rematch" data-id="${l.id}">הרצת התאמה מחדש</button>` : ''}</div>
      ${p ? notice('ok', 'check', `שובץ ל<b>${esc(p.business)}</b> (${esc(p.name)}).`) : ''}
      ${!miss.length && l.consent ? matchTable(l, !['cancelled','closed'].includes(l.status)) : '<p class="small muted">ההתאמה תרוץ אחרי השלמת הפרטים וקבלת הסכמה.</p>'}
    </div>
    ${l.quote ? `<div class="card stack"><h3>כספים</h3>
      <div class="calc small num">
        <span>הצעת מחיר (לפני מע״מ)</span><span>${ils2(l.quote.amount)}</span>
        <span>לתשלום כולל מע״מ</span><span>${ils2(pay.due)}</span>
        <span>התקבל</span><span>${ils2(pay.paid)}</span>
        ${pay.refunded ? `<span>הוחזר</span><span>−${ils2(pay.refunded)}</span>` : ''}
        <span>נטו כולל מע״מ</span><span>${ils2(pay.net)}</span>
        <span>מע״מ (מוחרג מהעמלה)</span><span>−${ils2(c.vatPart)}</span>
        <span><b>בסיס לעמלה</b></span><span><b>${ils2(c.base)}</b></span>
        <span>שיעור · ${esc(c.source)}</span><span>${c.rate}%</span>
        <span class="t">עמלה</span><span class="t">${ils2(c.amount)}</span>
      </div>
      <div class="row">${payPill(pay.state)} ${commPill(l.commission.status)}</div>
      ${l.commission.status === 'disputed' ? notice('bad', 'flag', '<b>ערעור של בעל המקצוע:</b> ' + esc(l.commission.dispute)) + disputeTools(l) : ''}
      ${l.payments.length ? `<div>${l.payments.map(x => `<div class="item small"><span class="grow">${x.type === 'refund' ? 'החזר' : 'תשלום'} · ${esc(x.method)} · ${fdate(x.at)}</span><span class="num">${x.type === 'refund' ? '−' : ''}${ils2(x.amount)}</span> ${SIM}</div>`).join('')}</div>` : ''}
      ${['completed','closed','cancelled'].includes(l.status) && pay.net > 0 ? `<form id="refund-form" data-id="${l.id}" class="row"><input class="input grow num" id="rf-amt" inputmode="decimal" placeholder="סכום החזר כולל מע״מ" style="min-height:40px"><button class="btn ghost sm" type="submit">רישום החזר</button></form>` : ''}
      ${l.commission.status === 'due' ? `<button class="btn okb" data-act="collect" data-id="${l.id}">סימון העמלה כנגבתה (מדומה)</button>` : ''}
    </div>` : ''}
    <div class="row">${!['cancelled','closed'].includes(l.status) ? `<button class="btn danger sm" data-act="admin-cancel" data-id="${l.id}">ביטול הליד</button>` : ''}</div>
    <div class="card"><h3>היסטוריה</h3><ul class="timeline" style="margin-top:12px">${[...l.history].sort((a, b) => b.at - a.at).map(h => `<li><div class="small">${esc(h.text)}</div><div class="xs muted">${ftime(h.at)}</div></li>`).join('')}</ul></div>
  </div>` };
};
function disputeTools(l) {
  return `<form id="dispute-resolve" data-id="${l.id}" class="stack" style="background:var(--surface-2);padding:12px;border-radius:12px">
    <div class="label">יישוב המחלוקת</div>
    <div class="row"><label class="field grow"><span>שיעור עמלה מתוקן (%)</span><input class="input num" id="dr-rate" inputmode="decimal" placeholder="${commissionOf(S, l).rate}"></label></div>
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:6px"><button class="btn sm" type="submit" name="m" value="adjust">עדכון שיעור</button><button class="btn ghost sm" type="button" data-act="dispute-keep" data-id="${l.id}">דחיית הערעור</button><button class="btn danger sm" type="button" data-act="dispute-waive" data-id="${l.id}">ביטול העמלה</button></div>
    <p class="xs muted">בגרסת הייצור רק פעולת שרת מורשית תוכל לשנות רשומה כספית סופית.</p></form>`;
}

VIEWS.admin.providers = () => {
  const f = U.pf, q = f.q.trim().toLowerCase();
  const rows = S.providers.filter(p => (!f.cat || p.cats.includes(f.cat)) &&
    (!f.state || (f.state === 'pending' && !p.approved) || (f.state === 'active' && p.approved && p.active) || (f.state === 'suspended' && !p.active) || (f.state === 'nolicense' && !p.licenseVerified)) &&
    (!q || (p.name + p.business + p.cities.join(' ')).toLowerCase().includes(q)));
  return `<div class="stack">
    <div class="section-h"><h1 style="font-size:26px">בעלי מקצוע</h1><span class="small muted num">${rows.length} מתוך ${S.providers.length}</span></div>
    <div class="filters" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <input class="input" id="pf-q" data-pf="q" placeholder="חיפוש שם, עסק או עיר" value="${esc(f.q)}">
      <select class="input" id="pf-cat" data-pf="cat">${catOptions(f.cat, 'כל התחומים')}</select>
      <select class="input" id="pf-state" data-pf="state">${[['', 'כל המצבים'], ['active', 'פעילים'], ['pending', 'ממתינים לאישור'], ['suspended', 'מושעים'], ['nolicense', 'רישיון לא אומת']].map(([v, n]) => opt(v, n, v === f.state)).join('')}</select>
    </div>
    <div class="tbl-wrap cards-wrap"><table class="tbl cards"><thead><tr><th>עסק</th><th>תחומים</th><th>אזורים</th><th>דירוג</th><th>היענות</th><th>מצב</th></tr></thead><tbody>
    ${rows.map(p => `<tr class="click" data-act="open" data-type="provider" data-id="${p.id}" tabindex="0"><td data-l=""><b>${esc(p.business)}</b><div class="xs muted">${esc(p.name)}</div></td>
      <td data-l="תחומים">${p.cats.map(c => CAT[c].name).join(', ')}</td><td data-l="אזורים">${p.regions.map(r => REGIONS[r]).join(', ')}</td>
      <td data-l="דירוג" class="num">${p.rating}</td><td data-l="היענות" class="num">${pct(p.acceptRate)}</td>
      <td data-l="מצב"><span class="row" style="gap:4px;justify-content:flex-end">${!p.approved ? pill('ממתין', 'warn') : !p.active ? pill('מושעה', 'bad') : pill('פעיל', 'ok')}${!p.licenseVerified ? pill('רישיון', 'warn') : ''}${!p.available ? pill('לא זמין', 'plain') : ''}</span></td></tr>`).join('')}
    </tbody></table></div>
  </div>`;
};
SHEETS.provider = (id) => {
  const p = prov(S, id), e = earningsOf(id);
  const needsLic = p.cats.filter(c => CAT[c].license);
  return { title: esc(p.business), body: `<div class="stack">
    <div class="row">${SIM} <span class="small muted">${esc(p.name)} · <span class="ltr num">${esc(p.phone)}</span> · הצטרף ${fdate(p.joined)}</span></div>
    <div class="kpis">${kpi('עבודות', e.jobs.length)}${kpi('מחזור', ils(e.gross))}${kpi('עמלות', ils(e.comm))}${kpi('דירוג', p.rating)}</div>
    <div class="card stack"><h3>סטטוס ואימות</h3>
      <div class="row between"><span>אישור הצטרפות</span>${p.approved ? `<button class="btn ghost sm" data-act="pv" data-k="approved" data-id="${id}">ביטול אישור</button>` : `<button class="btn sm" data-act="pv" data-k="approved" data-id="${id}">אישור בעל המקצוע</button>`}</div>
      <div class="row between"><span>חשבון פעיל</span>${p.active ? `<button class="btn danger sm" data-act="pv" data-k="active" data-id="${id}">השעיה</button>` : `<button class="btn okb sm" data-act="pv" data-k="active" data-id="${id}">הפעלה מחדש</button>`}</div>
      <div class="row between"><span>רישיון${needsLic.length ? ` (${needsLic.map(c => CAT[c].license).join(', ')})` : ' – לא נדרש בתחומים שלו'}</span>${p.licenseVerified ? pill('אומת', 'ok') : `<button class="btn sm" data-act="pv" data-k="licenseVerified" data-id="${id}">סימון כמאומת</button>`}</div>
      <div class="row between"><span>זמינות</span>${p.available ? pill('זמין', 'ok') : pill('לא זמין', 'plain')}</div>
    </div>
    <form class="card stack" id="agreement-form" data-id="${id}"><h3>הסכם עמלה</h3>
      <p class="small muted">ריק = תעריף הקטגוריה. בפרויקטים מעל ${ils(LARGE_PROJECT_THRESHOLD)} חל תמיד תעריף פרויקט גדול.</p>
      <div class="row"><input class="input grow num" id="ag-rate" inputmode="decimal" value="${p.agreementRate ?? ''}" placeholder="למשל 9"><button class="btn sm" type="submit">שמירה</button></div></form>
    <div class="card"><h3>תחומים ואזורים</h3><p class="small">${p.cats.map(c => CAT[c].name).join(' · ')}</p><p class="small muted">${p.regions.map(r => REGIONS[r]).join(', ')}${p.cities.length ? ' · ' + p.cities.map(esc).join(', ') : ''}</p></div>
    <div class="card"><h3>עבודות</h3>${e.jobs.length ? e.jobs.map(l => `<button class="item small" style="width:100%;background:none;border-inline:0;border-top:0;cursor:pointer;text-align:start" data-act="open" data-type="lead" data-id="${l.id}"><span class="ltr num">${l.code}</span><span class="grow">${CAT[l.cat].name} · ${esc(l.city)}</span>${statusPill(l.status)}</button>`).join('') : '<p class="small muted">אין עבודות עדיין.</p>'}</div>
  </div>` };
};

VIEWS.admin.commissions = () => {
  const rows = S.leads.filter(l => l.payments.length || l.commission.status !== 'none').sort((a, b) => b.created - a.created);
  const sum = (st) => rows.filter(l => l.commission.status === st).reduce((a, l) => a + commissionOf(S, l).amount, 0);
  return `<div class="stack">
    <h1 style="font-size:26px">עמלות</h1>
    <div class="kpis">${kpi('לגבייה', ils(sum('due')))}${kpi('נגבו', ils(sum('collected')))}${kpi('נצברות', ils(sum('accruing')), 'עבודות בביצוע')}${kpi('במחלוקת', ils(sum('disputed')))}</div>
    ${notice('info', 'percent', `העמלה = (תשלומים − החזרים) ÷ ${1 + VAT} × שיעור. סדר הקדימות: פרויקט גדול → יישוב מחלוקת → הסכם אישי → תעריף קטגוריה.`)}
    ${rows.length ? `<div class="tbl-wrap cards-wrap"><table class="tbl cards"><thead><tr><th>עבודה</th><th>בעל מקצוע</th><th>בסיס</th><th>שיעור</th><th>עמלה</th><th>תשלום</th><th>עמלה</th></tr></thead><tbody>
      ${rows.map(l => { const c = commissionOf(S, l); return `<tr class="click" data-act="open" data-type="lead" data-id="${l.id}" tabindex="0"><td data-l=""><b class="ltr num">${l.code}</b> · ${CAT[l.cat].name}</td><td data-l="בעל מקצוע">${esc(prov(S, l.assignedTo).business)}</td>
        <td data-l="בסיס (ללא מע״מ)" class="num">${ils2(c.base)}</td><td data-l="שיעור" class="num">${c.rate}%</td><td data-l="עמלה" class="num"><b>${ils2(c.amount)}</b></td><td data-l="תשלום">${payPill(c.pay.state)}</td><td data-l="סטטוס עמלה">${commPill(l.commission.status)}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="card">${empty('percent', 'אין עמלות עדיין')}</div>`}
  </div>`;
};

VIEWS.admin.more = () => `<div class="stack"><h1 style="font-size:26px">ניהול</h1><div class="card"><div class="menu-list">
  ${Object.entries(ADMIN_MORE).map(([k, [n, ic]]) => `<button data-act="tab" data-tab="${k}"><span class="ic">${icon(ic, 20)}</span><span class="grow">${n}</span>${k === 'complaints' && badges().more ? `<span class="pill bad plain num">${badges().more}</span>` : ''}<span class="muted">‹</span></button>`).join('')}
  </div></div>
  <div class="card stack"><h3>נתוני הדגמה</h3><p class="small muted">הנתונים נשמרים רק בדפדפן הזה. איפוס מחזיר את ${S.providers.length} בעלי המקצוע ו־14 הלידים המקוריים.</p><button class="btn danger" data-act="reset">איפוס נתוני הדגמה</button></div></div>`;
const backBtn = () => `<button class="btn ghost sm" data-act="tab" data-tab="more" style="align-self:flex-start">› חזרה</button>`;

VIEWS.admin.customers = () => {
  const map = {};
  S.leads.forEach(l => { const k = l.customer.phone; (map[k] = map[k] || { name: l.customer.name, phone: k, city: l.city, leads: [], last: 0 }); map[k].leads.push(l); map[k].last = Math.max(map[k].last, l.created); if (l.customer.name) map[k].name = l.customer.name; });
  const rows = Object.values(map).sort((a, b) => b.last - a.last);
  return `<div class="stack">${backBtn()}<h1 style="font-size:26px">לקוחות</h1>
    ${notice('info', 'lock', 'בגרסת הייצור הגישה לפרטי לקוחות תוגבל לתפקידים מורשים ותתועד.')}
    <div class="tbl-wrap cards-wrap"><table class="tbl cards"><thead><tr><th>לקוח</th><th>טלפון</th><th>עיר</th><th>בקשות</th><th>שילם</th><th>אחרונה</th></tr></thead><tbody>
    ${rows.map(c => `<tr class="click" data-act="cust-leads" data-phone="${esc(c.phone)}" tabindex="0"><td data-l=""><b>${esc(c.name || 'ללא שם')}</b></td><td data-l="טלפון" class="ltr num">${esc(c.phone)}</td><td data-l="עיר">${esc(c.city)}</td><td data-l="בקשות" class="num">${c.leads.length}</td><td data-l="שילם" class="num">${ils(c.leads.reduce((a, l) => a + payInfo(l).net, 0))}</td><td data-l="אחרונה" class="num">${fdate(c.last)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
};

VIEWS.admin.categories = () => `<div class="stack">${backBtn()}<h1 style="font-size:26px">קטגוריות ותעריפים</h1>
  <form id="rates-form" class="stack">
  <div class="tbl-wrap cards-wrap"><table class="tbl cards"><thead><tr><th>תחום</th><th>קבוצה</th><th>טווח</th><th>שיעור עמלה</th><th>רישיון</th><th>ספקים</th><th>לידים</th></tr></thead><tbody>
  ${CATS.map(c => { const t = TIERS[c.tier]; return `<tr><td data-l=""><span class="row" style="gap:8px">${icon(c.icon, 18)}<b>${c.name}</b></span></td><td data-l="קבוצה">${t.name}</td><td data-l="טווח מותר" class="num">${t.min}–${t.max}%</td>
    <td data-l="שיעור"><input class="input num" style="min-height:38px;width:90px;padding:6px 8px" id="rate-${c.id}" name="${c.id}" inputmode="decimal" value="${S.catRates[c.id]}" data-min="${t.min}" data-max="${t.max}"></td>
    <td data-l="רישיון">${c.license ? pill('נדרש', 'info') : '<span class="muted">—</span>'}</td><td data-l="ספקים" class="num">${S.providers.filter(p => p.cats.includes(c.id) && p.approved).length}</td><td data-l="לידים" class="num">${S.leads.filter(l => l.cat === c.id).length}</td></tr>`; }).join('')}
  <tr><td data-l=""><b>פרויקט גדול</b><div class="xs muted">מעל ${ils(LARGE_PROJECT_THRESHOLD)} לפני מע״מ</div></td><td data-l="קבוצה">${TIERS.large.name}</td><td data-l="טווח מותר" class="num">${TIERS.large.min}–${TIERS.large.max}%</td><td data-l="שיעור"><input class="input num" style="min-height:38px;width:90px;padding:6px 8px" id="rate-large" name="large" inputmode="decimal" value="${S.largeRate}" data-min="${TIERS.large.min}" data-max="${TIERS.large.max}"></td><td data-l=""></td><td data-l=""></td><td data-l=""></td></tr>
  </tbody></table></div>
  <button class="btn" type="submit" style="align-self:flex-start">שמירת תעריפים</button></form></div>`;

VIEWS.admin.matching = () => {
  const s = U.sim;
  const fake = { customer: { name: 'בדיקה', phone: '050-0000000' }, cat: s.cat, city: s.city, urgency: s.urgency, desc: 'סימולציה', offers: [] };
  return `<div class="stack">${backBtn()}<h1 style="font-size:26px">מנוע ההתאמה</h1>
    <div class="grid g2">
      <div class="card stack"><h3>תנאי סף (כולם חובה)</h3><ul class="small" style="margin:0;padding-inline-start:18px;display:grid;gap:4px">
        <li>בעל המקצוע רשום בתחום המבוקש</li><li>העיר או האזור בתחום השירות שלו</li><li>מאושר ופעיל</li><li>רישיון מאומת בתחומים שמחייבים רישיון</li><li>מסומן כזמין</li></ul>
        <h3>חסימות</h3><ul class="small" style="margin:0;padding-inline-start:18px;display:grid;gap:4px"><li>אין שיבוץ כשחסרים שם, טלפון תקין, תחום, עיר או תיאור</li><li>אין העברה לאף ספק בלי הסכמת הלקוח</li><li>הליד נשלח לעד ${MAX_OFFERS} ספקים, והפרטים המלאים נחשפים רק למי שמקבל</li></ul></div>
      <div class="card stack"><h3>משקלות הדירוג</h3><div class="hbars">${Object.keys(WEIGHTS).map(k => `<div class="hbar"><span>${WEIGHT_NAMES[k]}</span><div class="bar"><i style="width:${WEIGHTS[k] / .3 * 100}%"></i></div><span class="num">${pct(WEIGHTS[k])}</span></div>`).join('')}</div>
        <p class="xs muted">קרבה: עיר מפורשת 100, אזור 60 · זמינות: תור פנוי ביחס לדחיפות · איכות: דירוג 3–5 · היענות: שיעור קבלה · הוגנות: פחות לידים ב־30 יום = ציון גבוה יותר</p></div>
    </div>
    <div class="card stack"><h2>סימולטור</h2>
      <div class="grid g3">
        <select class="input" id="sim-cat" data-sim="cat">${catOptions(s.cat)}</select>
        <select class="input" id="sim-city" data-sim="city">${cityOptions(s.city)}</select>
        <select class="input" id="sim-urg" data-sim="urgency">${Object.entries(URGENCY).map(([k, u]) => opt(k, u.name, k === s.urgency)).join('')}</select>
      </div>
      ${s.cat && s.city ? matchTable(fake, false) : ''}
    </div></div>`;
};

VIEWS.admin.complaints = () => {
  const rows = [...S.complaints].sort((a, b) => b.at - a.at);
  const ST = { open: ['פתוחה', 'bad'], in_review: ['בבדיקה', 'warn'], resolved: ['טופלה', 'ok'] };
  return `<div class="stack">${backBtn()}<h1 style="font-size:26px">תלונות</h1>
    ${rows.length ? rows.map(c => { const l = lead(c.leadId), p = l.assignedTo && prov(S, l.assignedTo); return `<div class="card stack">
      <div class="row between"><div><b>${esc(c.type)}</b> · <span class="ltr num">${l.code}</span><div class="xs muted">${esc(l.customer.name)} נגד ${p ? esc(p.business) : '—'} · ${fdate(c.at)}</div></div>${pill(ST[c.status][0], ST[c.status][1])}</div>
      <p class="small">${esc(c.text)}</p>${c.resolution ? notice('ok', 'check', esc(c.resolution)) : ''}
      ${c.status !== 'resolved' ? `<form class="stack" id="cr-form" data-id="${c.id}"><input class="input" id="cr-${c.id}" placeholder="סיכום הטיפול"><div class="row">${c.status === 'open' ? `<button type="button" class="btn ghost sm" data-act="c-review" data-id="${c.id}">העברה לבדיקה</button>` : ''}<button class="btn sm" type="submit">סגירת התלונה</button><button type="button" class="btn ghost sm" data-act="open" data-type="lead" data-id="${l.id}">לליד</button></div></form>` : ''}
    </div>`; }).join('') : `<div class="card">${empty('flag', 'אין תלונות')}</div>`}</div>`;
};

VIEWS.admin.reports = () => {
  const d = U.rangeDays, L = S.leads.filter(l => within(l, d));
  const agg = (keyFn, names) => {
    const m = {};
    L.forEach(l => { const k = keyFn(l); const r = m[k] = m[k] || { k, leads: 0, done: 0, turnover: 0, comm: 0 }; const c = commissionOf(S, l); r.leads++; if (['completed','closed'].includes(l.status)) r.done++; r.turnover += c.pay.net; r.comm += c.amount; });
    return Object.values(m).sort((a, b) => b.leads - a.leads).map(r => ({ ...r, name: names(r.k) }));
  };
  const tbl = (rows, head) => rows.length ? `<div class="tbl-wrap cards-wrap"><table class="tbl cards"><thead><tr><th>${head}</th><th>לידים</th><th>הושלמו</th><th>המרה</th><th>מחזור</th><th>עמלות</th></tr></thead><tbody>${rows.map(r => `<tr><td data-l=""><b>${esc(r.name)}</b></td><td data-l="לידים" class="num">${r.leads}</td><td data-l="הושלמו" class="num">${r.done}</td><td data-l="המרה" class="num">${pct(r.done / r.leads)}</td><td data-l="מחזור" class="num">${ils(r.turnover)}</td><td data-l="עמלות" class="num">${ils(r.comm)}</td></tr>`).join('')}</tbody></table></div>` : empty('chart', 'אין נתונים בטווח הזה');
  const top = S.providers.map(p => ({ p, e: earningsOf(p.id) })).filter(x => x.e.comm > 0).sort((a, b) => b.e.comm - a.e.comm).slice(0, 5);
  return `<div class="stack">${backBtn()}<div class="section-h"><h1 style="font-size:26px">דוחות</h1>
    <div class="chips">${[[7, '7 ימים'], [30, '30 יום'], [90, '90 יום'], [0, 'הכל']].map(([v, n]) => `<button class="chip" style="min-height:36px;padding:6px 12px" data-act="range" data-d="${v}" aria-pressed="${d === v}">${n}</button>`).join('')}</div></div>
    <div class="kpis">${kpi('לידים', L.length)}${kpi('ערך עבודה ממוצע', ils(L.filter(l => l.quote).reduce((a, l) => a + l.quote.amount, 0) / Math.max(1, L.filter(l => l.quote).length)), 'לפני מע״מ')}${kpi('זמן לשיבוץ', L.filter(l => l.assignedTo).length ? '1.0 שע׳' : '—', SIM)}${kpi('עמלות', ils(L.reduce((a, l) => a + commissionOf(S, l).amount, 0)))}</div>
    <div class="card stack"><h2>לפי תחום</h2>${tbl(agg(l => l.cat, k => CAT[k].name), 'תחום')}</div>
    <div class="card stack"><h2>לפי אזור</h2>${tbl(agg(l => CITY_REGION[l.city], k => REGIONS[k]), 'אזור')}</div>
    <div class="card stack"><h2>בעלי המקצוע המובילים</h2>${top.length ? top.map((x, i) => `<div class="item"><span class="avatar">${i + 1}</span><div class="grow"><b>${esc(x.p.business)}</b><div class="xs muted">${x.e.jobs.length} עבודות · ${stars(x.p.rating)}</div></div><div class="num" style="text-align:end"><b>${ils(x.e.comm)}</b><div class="xs muted">עמלות</div></div></div>`).join('') : empty('users', 'אין נתונים')}</div>
  </div>`;
};
