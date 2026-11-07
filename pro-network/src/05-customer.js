/* ============================================================
   Customer views
   ============================================================ */
const VIEWS = { customer: {}, pro: {}, admin: {} };
const SHEETS = {};

VIEWS.customer.home = () => {
  const active = S.providers.filter(p => p.approved && p.active).length;
  const cities = new Set(S.providers.flatMap(p => p.cities)).size;
  return `<div class="stack" style="gap:22px">
  <section class="hero">
    <canvas id="hero-map" aria-hidden="true"></canvas>
    <div class="label" style="color:var(--teal)">שירות ארצי · מטבריה ועד אילת</div>
    <h1 style="margin-top:6px">בעל המקצוע הנכון,<br>קרוב אליכם.</h1>
    <p>מתארים מה צריך, ואנחנו מתאימים בעלי מקצוע מאומתים לפי תחום, אזור וזמינות. ההצעות מגיעות אליכם, וההחלטה שלכם.</p>
    <form class="search" id="hero-search">
      <select class="input" id="hs-cat" aria-label="תחום">${catOptions(U.form.cat, 'מה צריך לתקן?')}</select>
      <select class="input" id="hs-city" aria-label="עיר">${cityOptions(U.form.city, 'באיזו עיר?')}</select>
      <button class="btn" type="submit">${icon('search', 18)} קבלו הצעות</button>
    </form>
    <div class="trust">
      <span>${icon('shield', 16)} בעלי מקצוע מאומתים</span>
      <span>${icon('check', 16)} בדיקת רישיון בתחומים מחייבים</span>
      <span>${icon('lock', 16)} הפרטים שלכם נמסרים רק בהסכמתכם</span>
    </div>
  </section>

  <section class="stack">
    <div class="section-h"><h2>במה אפשר לעזור?</h2><span class="small muted">${CATS.length} תחומים</span></div>
    <div class="cats">${CATS.map(c => `<button class="cat" data-act="pick-cat" data-cat="${c.id}"><span class="ic">${icon(c.icon, 22)}</span>${c.name}</button>`).join('')}</div>
  </section>

  <section class="card">
    <h2>איך זה עובד</h2>
    <div class="steps" style="margin-top:14px">
      <div class="step"><span class="n">1</span><div><h3>מתארים את העבודה</h3><p class="small muted">תחום, עיר, דחיפות ותמונה אם יש. לוקח פחות מדקה.</p></div></div>
      <div class="step"><span class="n">2</span><div><h3>אנחנו מתאימים</h3><p class="small muted">עד ${MAX_OFFERS} בעלי מקצוע זמינים באזור מקבלים את הבקשה, בלי הטלפון שלכם.</p></div></div>
      <div class="step"><span class="n">3</span><div><h3>מאשרים הצעה</h3><p class="small muted">בעל המקצוע שקיבל את העבודה שולח הצעת מחיר, ואתם מאשרים או דוחים.</p></div></div>
    </div>
  </section>

  <section class="kpis">
    ${kpi('בעלי מקצוע פעילים', active, SIM)}
    ${kpi('ערים מכוסות', cities, SIM)}
    ${kpi('תחומי שירות', CATS.length)}
    ${kpi('בקשות במערכת', S.leads.length, SIM)}
  </section>

  <section class="card row between" style="background:var(--teal-soft);border-color:transparent">
    <div class="grow"><h3>בעלי מקצוע? הצטרפו לרשת</h3><p class="small muted">קבלו עבודות באזור שלכם ושלמו עמלה רק על עבודות ששולמו בפועל.</p></div>
    <button class="btn navy" data-act="switch-role" data-role="pro">לממשק בעלי המקצוע</button>
  </section>
  </div>`;
};

function sampleForm() {
  Object.assign(U.form, { cat: 'plumbing', city: 'גבעתיים', urgency: 'now', desc: 'דוד החשמל דולף מהחיבור התחתון ויש מים על הרצפה בארון השירות. צריך מישהו היום.', name: 'דנה אברמוב', phone: '052-7788990', email: 'dana@example.com', address: 'רחוב כצנלסון 40, דירה 6', consent: true });
  U.errors = {};
}

VIEWS.customer.request = () => {
  const f = U.form, e = U.errors;
  if (U.justCreated) return requestSuccess(lead(U.justCreated));
  const err = (k) => e[k] ? `<span class="ferr">${esc(e[k])}</span>` : '';
  return `<form id="req-form" class="stack" novalidate style="max-width:720px;margin:0 auto">
    <div class="section-h"><div><h1 style="font-size:26px">בקשת שירות חדשה</h1><p class="muted small" style="margin-top:4px">השדות המסומנים ב־* הכרחיים כדי שנוכל להתאים בעל מקצוע.</p></div>
      <button type="button" class="btn ghost sm" data-act="sample">${icon('play', 16)} מלאו דוגמה</button></div>

    <div class="card stack">
      <h3>מה צריך?</h3>
      <div class="grid g2">
        <label class="field"><span>תחום <i>*</i></span><select class="input${e.cat ? ' err' : ''}" id="f-cat" data-bind="cat">${catOptions(f.cat)}</select>${err('cat')}</label>
        <label class="field"><span>עיר <i>*</i></span><select class="input${e.city ? ' err' : ''}" id="f-city" data-bind="city">${cityOptions(f.city)}</select>${err('city')}</label>
      </div>
      ${f.cat && CAT[f.cat].license ? notice('info', 'shield', `בתחום ${CAT[f.cat].name} נשלח את הבקשה רק לבעלי מקצוע עם ${CAT[f.cat].license} מאומת.`) : ''}
      <div class="field"><span>מתי? <i>*</i></span>
        <div class="chips" role="radiogroup">${Object.entries(URGENCY).map(([k, u]) => `<button type="button" class="chip" role="radio" aria-pressed="${f.urgency === k}" aria-checked="${f.urgency === k}" data-act="urgency" data-u="${k}">${u.name}<small>${u.hint}</small></button>`).join('')}</div>
      </div>
      <label class="field"><span>תיאור העבודה <i>*</i></span><textarea class="input${e.desc ? ' err' : ''}" id="f-desc" data-bind="desc" placeholder="לדוגמה: נזילה מתחת לכיור במטבח, התחילה הבוקר.">${esc(f.desc)}</textarea>${err('desc')}</label>
      <div class="field"><span>תמונה (לא חובה)</span>
        <label class="upload" for="f-img">${f.image ? `<img src="${f.image}" alt="תמונה שצורפה">` : icon('image', 28)}<div class="small">${f.image ? 'החליפו תמונה' : 'צרפו תמונה של התקלה'}</div><div class="xs muted">התמונה נשמרת רק בדפדפן הזה</div></label>
        <input type="file" id="f-img" accept="image/*" hidden>
        ${f.image ? `<button type="button" class="btn ghost sm" data-act="rm-img" style="align-self:flex-start">הסרת תמונה</button>` : ''}
      </div>
    </div>

    <div class="card stack">
      <h3>פרטי התקשרות</h3>
      <div class="grid g2">
        <label class="field"><span>שם מלא <i>*</i></span><input class="input${e.name ? ' err' : ''}" id="f-name" data-bind="name" value="${esc(f.name)}" autocomplete="name">${err('name')}</label>
        <label class="field"><span>טלפון נייד <i>*</i></span><input class="input${e.phone ? ' err' : ''}" id="f-phone" data-bind="phone" value="${esc(f.phone)}" inputmode="tel" autocomplete="tel" placeholder="050-0000000" dir="ltr" style="text-align:right">${err('phone')}</label>
        <label class="field"><span>אימייל</span><input class="input" id="f-email" data-bind="email" value="${esc(f.email)}" inputmode="email" autocomplete="email" dir="ltr" style="text-align:right"></label>
        <label class="field"><span>כתובת</span><input class="input" id="f-address" data-bind="address" value="${esc(f.address)}" autocomplete="street-address" placeholder="נמסרת רק לבעל המקצוע שתאשרו"></label>
      </div>
      <label class="check" for="f-consent"><input type="checkbox" id="f-consent" data-bind="consent"${f.consent ? ' checked' : ''}>
        <span><b>אני מסכים/ה להעביר את פרטי הבקשה לבעלי מקצוע מתאימים</b><br><span class="small muted">בשלב הראשון בעלי המקצוע רואים רק תחום, עיר ותיאור. השם, הטלפון והכתובת נחשפים רק לבעל המקצוע שיקבל את העבודה.</span></span></label>
      ${!f.consent ? notice('warn', 'alert', 'בלי הסכמה הבקשה תישמר אבל לא תישלח לאף בעל מקצוע. אפשר לאשר אחר כך בעמוד המעקב.') : ''}
    </div>
    <button class="btn block" type="submit"${U.submitting ? ' disabled' : ''}>${U.submitting ? '<span class="spinner"></span> מחפשים בעלי מקצוע מתאימים…' : 'שליחת הבקשה'}</button>
  </form>`;
};

function requestSuccess(l) {
  const m = l.status === 'matched';
  return `<div class="stack" style="max-width:620px;margin:0 auto">
    <div class="card pop stack" style="text-align:center;align-items:center">
      <div style="width:56px;height:56px;border-radius:50%;background:${m ? 'var(--ok-soft)' : 'var(--warn-soft)'};color:${m ? 'var(--ok)' : 'var(--warn)'};display:grid;place-items:center">${icon(m ? 'check' : 'alert', 30)}</div>
      <h1 style="font-size:24px">${m ? 'הבקשה נשלחה' : 'הבקשה נשמרה'}</h1>
      <p class="muted">${m ? `הבקשה הועברה ל־${l.offers.length} בעלי מקצוע מתאימים ב${esc(l.city)} והסביבה. נעדכן כאן ברגע שמישהו יקבל אותה.` : esc(STATUS[l.status].name) + '. אפשר להשלים את זה בעמוד המעקב.'}</p>
      <div class="label" style="margin-top:6px">מספר מעקב</div>
      <div style="font-family:var(--f-display);font-size:30px;font-weight:700;letter-spacing:.04em" class="ltr num">${l.code}</div>
      ${notice('info', 'info', 'זו הדגמה: לא נשלחו הודעות SMS או וואטסאפ. בעלי המקצוע רואים את הבקשה בממשק שלהם בתוך האפליקציה.')}
    </div>
    <div class="grid g2">
      <button class="btn" data-act="track-lead" data-id="${l.id}">${icon('search', 18)} מעקב אחר הבקשה</button>
      ${m ? `<button class="btn navy" data-act="as-pro" data-id="${l.id}">${icon('brief', 18)} לראות כבעל מקצוע</button>` : ''}
      <button class="btn ghost" data-act="new-request">בקשה נוספת</button>
    </div>
  </div>`;
}

VIEWS.customer.track = () => {
  const l = S.leads.find(x => x.code.toLowerCase() === U.trackCode.trim().toLowerCase());
  const recent = [...S.leads].sort((a, b) => b.created - a.created).slice(0, 5);
  return `<div class="stack" style="max-width:720px;margin:0 auto">
    <h1 style="font-size:26px">מעקב בקשה</h1>
    <form id="track-form" class="row"><input class="input grow" id="t-code" placeholder="מספר מעקב, לדוגמה PN-1040" value="${esc(U.trackCode)}" dir="ltr" style="text-align:right"><button class="btn" type="submit">חיפוש</button></form>
    <div class="row small"><span class="muted">בקשות אחרונות ${SIM}</span>${recent.map(r => `<button class="chip" style="min-height:34px;padding:5px 10px" data-act="track-code" data-code="${r.code}"><span class="ltr num">${r.code}</span></button>`).join('')}</div>
    ${U.trackCode && !l ? notice('bad', 'alert', 'לא מצאנו בקשה עם המספר הזה. בדקו שהוא מופיע כמו בהודעת האישור, למשל PN-1052.') : ''}
    ${l ? trackDetail(l) : (!U.trackCode ? empty('search', 'הזינו מספר מעקב', 'המספר מופיע במסך האישור אחרי שליחת הבקשה.') : '')}
  </div>`;
};

function trackDetail(l) {
  const p = l.assignedTo && prov(S, l.assignedTo);
  const idx = FLOW.indexOf(l.status);
  const pay = payInfo(l);
  const pending = l.offers.filter(o => o.status === 'pending').length;
  let action = '';
  if (l.status === 'no_consent') action = `<div class="card stack">${notice('warn', 'lock', 'הבקשה לא נשלחה לאף בעל מקצוע כי לא אושרה העברת פרטים.')}<button class="btn" data-act="give-consent" data-id="${l.id}">אני מאשר/ת להעביר את הבקשה</button></div>`;
  if (l.status === 'pending_info') action = `<form class="card stack" id="fix-form" data-id="${l.id}">${notice('warn', 'alert', 'חסרים פרטים: ' + esc(missingFields(l).join(', ')))}
      <div class="grid g2"><label class="field"><span>שם מלא</span><input class="input" id="fx-name" value="${esc(l.customer.name)}"></label><label class="field"><span>טלפון</span><input class="input" id="fx-phone" value="${esc(l.customer.phone)}" dir="ltr" style="text-align:right"></label></div>
      <label class="field"><span>תיאור</span><textarea class="input" id="fx-desc">${esc(l.desc)}</textarea></label><button class="btn" type="submit">השלמת פרטים ושליחה</button></form>`;
  if (l.status === 'quoted') action = `<div class="card pop stack"><div class="row between"><h3>הצעת מחיר מ${esc(p.business)}</h3>${SIM}</div>
      <div class="calc num"><span>עבודה (לפני מע״מ)</span><span>${ils2(l.quote.amount)}</span><span>מע״מ ${pct(VAT)}</span><span>${ils2(l.quote.amount * VAT)}</span><span class="t">סה״כ לתשלום</span><span class="t">${ils2(l.quote.amount * (1 + VAT))}</span></div>
      ${l.quote.note ? `<p class="small muted">${esc(l.quote.note)}</p>` : ''}
      <div class="grid g2"><button class="btn okb" data-act="approve-quote" data-id="${l.id}">${icon('check', 18)} אישור ההצעה</button><button class="btn danger" data-act="decline-quote" data-id="${l.id}">דחיית ההצעה</button></div></div>`;
  if (['completed', 'closed'].includes(l.status) && !l.review) action = `<form class="card stack" id="review-form" data-id="${l.id}"><h3>איך היה השירות?</h3>
      <div class="chips" id="rv-stars">${[5,4,3,2,1].map(n => `<button type="button" class="chip" data-act="rv-star" data-n="${n}" aria-pressed="${(U.rv || 5) === n}">${'★'.repeat(n)}</button>`).join('')}</div>
      <textarea class="input" id="rv-text" placeholder="כמה מילים על בעל המקצוע"></textarea><button class="btn" type="submit">פרסום חוות דעת</button></form>`;
  const canCancel = ['matched','accepted','quoted','approved','no_consent','pending_info','unmatched'].includes(l.status);
  return `<div class="card pop stack">
      <div class="row between"><div><div class="label">בקשה <span class="ltr num">${l.code}</span> ${l.demo ? SIM : ''}</div><h2 style="margin-top:4px">${CAT[l.cat].name} · ${esc(l.city)}</h2></div>${statusPill(l.status)}</div>
      ${idx >= 0 ? `<div class="progress" aria-label="התקדמות">${FLOW.map((s, i) => `<i class="${i <= idx ? 'on' : ''}" title="${STATUS[s].name}"></i>`).join('')}</div><div class="xs muted">שלב ${idx + 1} מתוך ${FLOW.length}: ${STATUS[l.status].name}</div>` : ''}
      <p>${esc(l.desc)}</p>
      ${l.image ? `<img src="${l.image}" alt="תמונה מהבקשה" style="border-radius:12px;max-height:200px;object-fit:cover">` : ''}
      <div class="row small muted"><span>${icon('clock', 16)} ${URGENCY[l.urgency].name}</span><span>נפתחה ${ftime(l.created)}</span></div>
      ${l.status === 'matched' ? notice('info', 'clock', `הבקשה אצל ${pending} בעלי מקצוע. הפרטים האישיים שלכם עדיין לא נחשפו לאף אחד.`) : ''}
      ${l.status === 'unmatched' ? notice('bad', 'alert', 'לא מצאנו כרגע בעל מקצוע פנוי באזור. צוות PRO NETWORK יטפל בבקשה ידנית.') : ''}
    </div>
    ${action}
    ${p ? `<div class="card row"><span class="avatar">${initials(p.name)}</span><div class="grow"><h3>${esc(p.business)}</h3><div class="small muted">${esc(p.name)} · ${stars(p.rating)} <span class="num">${p.rating}</span></div><div class="small ltr num">${esc(p.phone)}</div></div>${SIM}</div>` : ''}
    ${l.quote && l.status !== 'quoted' ? `<div class="card stack"><h3>תשלום</h3><div class="calc num"><span>סה״כ לפי הצעה (כולל מע״מ)</span><span>${ils2(pay.due)}</span><span>שולם</span><span>${ils2(pay.net)}</span><span class="t">יתרה</span><span class="t">${ils2(pay.balance)}</span></div><div>${payPill(pay.state)}</div></div>` : ''}
    ${l.review ? `<div class="card"><h3>חוות הדעת שלכם</h3><div>${stars(l.review.stars)}</div><p class="small">${esc(l.review.text)}</p></div>` : ''}
    <div class="card"><h3>היסטוריה</h3><ul class="timeline" style="margin-top:12px">${[...l.history].sort((a, b) => b.at - a.at).map(h => `<li><div class="small">${esc(h.text)}</div><div class="xs muted">${ftime(h.at)}</div></li>`).join('')}</ul></div>
    <div class="row">${l.assignedTo ? `<button class="btn ghost sm" data-act="complain" data-id="${l.id}">${icon('flag', 16)} דיווח על בעיה</button>` : ''}${canCancel ? `<button class="btn danger sm" data-act="cust-cancel" data-id="${l.id}">ביטול הבקשה</button>` : ''}</div>`;
}

SHEETS.complain = (id) => {
  const l = lead(id);
  return { title: 'דיווח על בעיה', body: `<form id="complain-form" data-id="${id}" class="stack">
    <p class="muted small">בקשה <span class="ltr num">${l.code}</span>. הדיווח יגיע לצוות PRO NETWORK, לא לבעל המקצוע.</p>
    <label class="field"><span>סוג הבעיה</span><select class="input" id="cp-type">${['איכות עבודה','עיכוב','מחיר שונה מההצעה','התנהגות','אחר'].map(t => opt(t, t)).join('')}</select></label>
    <label class="field"><span>מה קרה?</span><textarea class="input" id="cp-text" required></textarea></label>
    <button class="btn" type="submit">שליחת הדיווח</button></form>` };
};
SHEETS.confirm = (id) => {
  const c = U.confirm;
  return { title: esc(c.title), body: `<div class="stack"><p>${esc(c.text)}</p><div class="grid g2"><button class="btn danger" data-act="confirm-yes">${esc(c.yes)}</button><button class="btn ghost" data-act="close-sheet">חזרה</button></div></div>` };
};
function askConfirm(title, text, yes, fn) { U.confirm = { title, text, yes, fn }; openSheet('confirm'); }
