/* ============================================================
   PRO NETWORK — core: reference data, demo seed, matching engine,
   commission engine, store. No network calls anywhere.
   ============================================================ */
'use strict';

const VAT = 0.18;                    // Israeli VAT rate (2025+)
const LARGE_PROJECT_THRESHOLD = 50000; // ₪ excl. VAT
const MAX_OFFERS = 3;                 // providers that receive each lead

const REGIONS = {
  north: 'צפון', haifa: 'חיפה והקריות', sharon: 'השרון', center: 'מרכז וגוש דן',
  shfela: 'השפלה', jerusalem: 'ירושלים והסביבה', south: 'דרום'
};
const CITIES = [
  ['תל אביב-יפו','center'],['רמת גן','center'],['גבעתיים','center'],['חולון','center'],['בת ים','center'],
  ['פתח תקווה','center'],['בני ברק','center'],['ראש העין','center'],['אריאל','center'],
  ['ראשון לציון','shfela'],['רחובות','shfela'],['נס ציונה','shfela'],['מודיעין','shfela'],['רמלה','shfela'],['לוד','shfela'],
  ['ירושלים','jerusalem'],['בית שמש','jerusalem'],['מבשרת ציון','jerusalem'],['מעלה אדומים','jerusalem'],
  ['נתניה','sharon'],['הרצליה','sharon'],['רעננה','sharon'],['כפר סבא','sharon'],['הוד השרון','sharon'],['חדרה','sharon'],
  ['חיפה','haifa'],['קריית ביאליק','haifa'],['קריית אתא','haifa'],['נשר','haifa'],['טירת כרמל','haifa'],
  ['עפולה','north'],['נצרת','north'],['טבריה','north'],['כרמיאל','north'],['נהריה','north'],['צפת','north'],['קריית שמונה','north'],
  ['אשדוד','south'],['אשקלון','south'],['באר שבע','south'],['קריית גת','south'],['דימונה','south'],['אילת','south']
];
const CITY_REGION = Object.fromEntries(CITIES);

const TIERS = {
  small:   { name: 'תיקונים קטנים',   min: 10, max: 15, def: 12 },
  service: { name: 'הדברה וניקיון',    min: 10, max: 15, def: 12 },
  tech:    { name: 'מצלמות ומיזוג',    min: 8,  max: 12, def: 10 },
  reno:    { name: 'שיפוצים',          min: 5,  max: 8,  def: 6 },
  large:   { name: 'פרויקטים גדולים',  min: 3,  max: 5,  def: 4 }
};

const CATS = [
  { id:'plumbing', name:'אינסטלציה',        icon:'drop',   tier:'small' },
  { id:'electric', name:'חשמל',              icon:'bolt',   tier:'small',   license:'רישיון חשמלאי (משרד העבודה)' },
  { id:'ac',       name:'מיזוג אוויר',       icon:'snow',   tier:'tech',    license:'תעודת טכנאי קירור ומיזוג' },
  { id:'pest',     name:'הדברה',             icon:'bug',    tier:'service', license:'היתר מדביר (המשרד להגנת הסביבה)' },
  { id:'reno',     name:'שיפוצים',           icon:'brick',  tier:'reno' },
  { id:'cameras',  name:'מצלמות אבטחה',      icon:'cam',    tier:'tech' },
  { id:'cleaning', name:'ניקיון',            icon:'spark',  tier:'service' },
  { id:'garden',   name:'גינון',             icon:'leaf',   tier:'service' },
  { id:'locks',    name:'מנעולנות',          icon:'key',    tier:'small' },
  { id:'paint',    name:'צביעה',             icon:'brush',  tier:'small' },
  { id:'appliance',name:'מכשירי חשמל',       icon:'tool',   tier:'small' },
  { id:'solar',    name:'דודים וסולארי',     icon:'sun',    tier:'tech' },
  { id:'aluminum', name:'אלומיניום וזגגות',  icon:'window', tier:'reno' },
  { id:'moving',   name:'הובלות',            icon:'truck',  tier:'service' }
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

const URGENCY = {
  now:  { name:'דחוף – היום',     hint:'תקלה שמונעת שימוש', hours:6 },
  soon: { name:'תוך 48 שעות',     hint:'צריך בקרוב',        hours:48 },
  week: { name:'השבוע',           hint:'בימים הקרובים',     hours:168 },
  flex: { name:'גמיש',            hint:'אין לחץ זמן',        hours:720 }
};

const STATUS = {
  pending_info: { name:'חסרים פרטים',          tone:'warn' },
  no_consent:   { name:'ממתין להסכמת לקוח',    tone:'warn' },
  unmatched:    { name:'אין התאמה',            tone:'bad'  },
  matched:      { name:'נשלח לבעלי מקצוע',     tone:'info' },
  accepted:     { name:'בעל מקצוע שובץ',       tone:'teal' },
  quoted:       { name:'התקבלה הצעת מחיר',     tone:'teal' },
  approved:     { name:'הלקוח אישר',           tone:'ok'   },
  in_progress:  { name:'בביצוע',               tone:'ok'   },
  completed:    { name:'הושלם',                tone:'ok'   },
  closed:       { name:'שולם ונסגר',           tone:'plain'},
  cancelled:    { name:'בוטל',                 tone:'bad'  }
};
const FLOW = ['matched','accepted','quoted','approved','in_progress','completed','closed'];

const COMM_STATUS = {
  none:      { name:'אין עמלה',        tone:'plain' },
  accruing:  { name:'נצברת',           tone:'info'  },
  due:       { name:'לגבייה',          tone:'warn'  },
  collected: { name:'נגבתה',           tone:'ok'    },
  disputed:  { name:'במחלוקת',         tone:'bad'   },
  waived:    { name:'בוטלה',           tone:'plain' }
};

/* ---------- utils ---------- */
const DAY = 864e5;
const now = () => Date.now();
const uid = (p) => p + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ils = (n) => '₪' + Math.round(n || 0).toLocaleString('he-IL');
const ils2 = (n) => '₪' + (Math.round((n || 0) * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x, d = 0) => (x * 100).toFixed(d) + '%';
const fdate = (t) => new Date(t).toLocaleDateString('he-IL', { day:'numeric', month:'numeric', year:'2-digit' });
const ftime = (t) => new Date(t).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' });
const ago = (t) => { const m = Math.round((now() - t) / 6e4); if (m < 1) return 'עכשיו'; if (m < 60) return `לפני ${m} דק׳`; const h = Math.round(m / 60); if (h < 24) return `לפני ${h} שע׳`; return `לפני ${Math.round(h / 24)} ימים`; };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('');
const maskName = (name) => { const p = name.trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
const maskPhone = (ph) => ph.replace(/\d(?=\d{2})/g, '•');
const validPhone = (ph) => /^0(5\d|[2-4]|[8-9]|7\d)-?\d{7}$/.test(ph.replace(/\s/g, ''));

/* ---------- demo seed ---------- */
function seed() {
  const P = (id, name, business, cats, cities, regions, o = {}) => ({
    id, name, business, cats, cities, regions,
    phone: o.phone || '050-0000000', approved: o.approved ?? true, active: o.active ?? true,
    licenseVerified: o.lic ?? true, available: o.available ?? true, nextSlotH: o.slot ?? 24,
    acceptRate: o.acc ?? 0.8, offers30: o.off ?? 6, rating: o.rating ?? 4.6,
    agreementRate: o.rate ?? null, joined: now() - (o.joinedDays ?? 200) * DAY,
    reviews: o.reviews || [], demo: true
  });
  const R = (who, stars, text, days) => ({ who, stars, text, at: now() - days * DAY });
  const providers = [
    P('p1','אבי כהן','כהן אינסטלציה',['plumbing','solar'],['תל אביב-יפו','רמת גן','גבעתיים'],['center'],{slot:4,acc:.86,off:9,rating:4.8,phone:'052-3141592',reviews:[R('מיכל ש.',5,'הגיע תוך שעה, פתר נזילה מתחת לכיור. מקצועי ונקי.',12),R('רון ד.',5,'מחיר הוגן והסביר הכל.',40)]}),
    P('p2','יוסי לוי','לוי חשמל ובקרה',['electric','cameras'],['תל אביב-יפו','חולון','בת ים'],['center','shfela'],{slot:6,acc:.74,off:11,rating:4.5,phone:'054-2718281',reviews:[R('דנה ל.',4,'עבודה טובה, קצת איחור.',8)]}),
    P('p3','מוחמד חסן','קור פלוס מיזוג',['ac'],['חיפה','קריית ביאליק','נשר','קריית אתא'],['haifa'],{slot:24,acc:.91,off:5,rating:4.9,phone:'053-1123581',reviews:[R('אורי ב.',5,'ניקה ומילא גז, המזגן כמו חדש.',20)]}),
    P('p4','שרון אברהם','אברהם שיפוצים',['reno','paint','aluminum'],['ירושלים','מבשרת ציון','בית שמש'],['jerusalem'],{slot:72,acc:.62,off:4,rating:4.4,rate:5.5,phone:'058-7654321'}),
    P('p5','דוד מזרחי','מזרחי הדברות',['pest'],['באר שבע','דימונה'],['south'],{slot:12,acc:.8,off:3,rating:4.7,phone:'050-5550101'}),
    P('p6','נועה פרידמן','ניקיון ברק',['cleaning'],['נתניה','הרצליה','רעננה','כפר סבא'],['sharon'],{slot:24,acc:.88,off:7,rating:4.8,phone:'052-8889900',reviews:[R('גלית מ.',5,'ניקיון אחרי שיפוץ ברמה גבוהה.',5)]}),
    P('p7','עומר בן דוד','מנעולן 24/7',['locks'],['תל אביב-יפו','רמת גן','בני ברק','פתח תקווה'],['center'],{slot:1,acc:.95,off:14,rating:4.6,phone:'054-1010101'}),
    P('p8','איתי גולן','גולן מערכות אבטחה',['cameras','electric'],['ראשון לציון','רחובות','נס ציונה'],['shfela','center'],{slot:48,acc:.7,off:5,rating:4.3,lic:false,phone:'050-3030303'}),
    P('p9','רינה אוחיון','גינות אוחיון',['garden'],['מודיעין','רמלה','לוד'],['shfela'],{slot:72,acc:.66,off:2,rating:4.5,phone:'053-4040404'}),
    P('p10','אלכס פטרוב','פטרוב מיזוג',['ac','appliance'],['תל אביב-יפו','חולון','ראשון לציון'],['center'],{slot:24,acc:.78,off:8,rating:4.6,phone:'052-6060606'}),
    P('p11','חיים ביטון','ביטון אינסטלציה',['plumbing'],['אשדוד','אשקלון','קריית גת'],['south'],{slot:6,acc:.83,off:4,rating:4.7,phone:'050-7070707'}),
    P('p12','סאמר ח׳ורי','ח׳ורי בנייה ושיפוצים',['reno','paint'],['חיפה','טירת כרמל'],['haifa','north'],{slot:120,acc:.58,off:3,rating:4.2,rate:5,phone:'054-8080808'}),
    P('p13','מאיה רוזן','רוזן חשמל',['electric'],['נתניה','חדרה'],['sharon'],{slot:24,acc:.81,off:4,rating:4.7,approved:false,joinedDays:3,phone:'052-9090909'}),
    P('p14','גיל שטרן','שטרן הובלות',['moving'],['תל אביב-יפו'],['center','sharon','shfela'],{slot:48,acc:.72,off:6,rating:4.4,phone:'050-1212121'}),
    P('p15','בני עזרא','עזרא דודי שמש',['solar','plumbing'],['ירושלים'],['jerusalem'],{slot:24,acc:.77,off:5,rating:4.5,available:false,phone:'058-1313131'}),
    P('p16','לילך נחום','נחום הדברה ירוקה',['pest','garden'],['תל אביב-יפו','רמת גן','הרצליה'],['center','sharon'],{slot:24,acc:.84,off:6,rating:4.8,phone:'053-1414141'})
  ];
  providers.forEach(p => { if (p.reviews.length) p.rating = +(p.reviews.reduce((a, r) => a + r.stars, 0) / p.reviews.length * .5 + p.rating * .5).toFixed(1); });

  let n = 1040;
  const L = (o) => {
    const t = now() - o.days * DAY;
    const lead = {
      id: uid('l'), code: 'PN-' + (n++), created: t, demo: true,
      customer: { name: o.name, phone: o.phone, email: '', address: o.address || '' },
      cat: o.cat, city: o.city, urgency: o.urg || 'soon', desc: o.desc, image: null, consent: true,
      status: 'matched', offers: [], assignedTo: null, quote: null, payments: [], commission: { status: 'none' },
      review: null, history: [{ at: t, text: 'הבקשה נקלטה במערכת' }]
    };
    return lead;
  };
  const leads = [
    L({days:0.1,name:'רותם ישראלי',phone:'052-1234567',cat:'plumbing',city:'רמת גן',urg:'now',desc:'נזילה חזקה מתחת לכיור במטבח, הברז הראשי סגור כרגע.'}),
    L({days:0.4,name:'שירה כץ',phone:'054-7654321',cat:'ac',city:'חיפה',urg:'soon',desc:'מזגן בסלון מטפטף מים ולא מקרר. דגם אלקטרה 1.5 כ״ס.'}),
    L({days:1.2,name:'משה דהן',phone:'050-2223344',cat:'electric',city:'חולון',urg:'soon',desc:'קפיצות של הפחת כשמפעילים את התנור והמדיח יחד.'}),
    L({days:2,name:'תמר לוין',phone:'053-9988776',cat:'cleaning',city:'הרצליה',urg:'week',desc:'ניקיון דירת 4 חדרים לאחר שיפוץ, כולל חלונות.'}),
    L({days:3,name:'אלון שגיא',phone:'052-5556677',cat:'reno',city:'ירושלים',urg:'flex',desc:'שיפוץ חדר רחצה מלא: ריצוף, חיפוי, כלים סניטריים.'}),
    L({days:5,name:'יעל ברק',phone:'054-1112233',cat:'locks',city:'בני ברק',urg:'now',desc:'ננעלתי מחוץ לדירה, המפתח בפנים.'}),
    L({days:7,name:'אורן מלכה',phone:'050-4445566',cat:'pest',city:'באר שבע',urg:'soon',desc:'ג׳וקים במטבח ובחדר הרחצה, דירה בקומה 2.'}),
    L({days:9,name:'נטע אלמוג',phone:'053-6667788',cat:'cameras',city:'ראשון לציון',urg:'week',desc:'התקנת 4 מצלמות חוץ ו־DVR לבית פרטי.'}),
    L({days:12,name:'קרן שמעוני',phone:'052-7778899',cat:'ac',city:'תל אביב-יפו',urg:'soon',desc:'התקנת מזגן עילי חדש בחדר שינה.'}),
    L({days:16,name:'עידו פרץ',phone:'054-8889911',cat:'plumbing',city:'אשדוד',urg:'now',desc:'סתימה בקו ביוב ראשי, מים עולים במקלחת.'}),
    L({days:21,name:'ליאת חדד',phone:'050-9990011',cat:'reno',city:'חיפה',urg:'flex',desc:'שיפוץ כללי של דירת 5 חדרים כולל מטבח.'}),
    L({days:26,name:'בועז רז',phone:'053-1212343',cat:'garden',city:'מודיעין',urg:'week',desc:'גיזום עצים ושתילת דשא בגינה של 80 מ״ר.'}),
    L({days:0.05,name:'',phone:'052-0000111',cat:'electric',city:'נתניה',urg:'soon',desc:'שקע שרוף בסלון.'}),
    L({days:0.2,name:'גלעד אשכנזי',phone:'054-3434343',cat:'paint',city:'בית שמש',urg:'week',desc:'צביעת דירת 3 חדרים.'})
  ];
  const st = { providers, leads, complaints: [], catRates: Object.fromEntries(CATS.map(c => [c.id, TIERS[c.tier].def])),
               largeRate: TIERS.large.def, proId: 'p1', demoLeadId: null, adminSawDemo: false, ver: 1 };

  // run each seeded lead through the real pipeline, then advance some of them
  leads.forEach(l => intake(st, l, true, l.created + 60e3));
  const adv = (i, pid, to, quote, pays) => {
    const l = leads[i]; const day = l.created;
    if (!l.offers.find(o => o.pid === pid)) l.offers.push({ pid, status: 'pending', score: 0, at: day });
    accept(st, l, pid, day + 3600e3);
    if (to === 'accepted') return;
    submitQuote(st, l, quote, 'כולל חלקים ועבודה', day + 7200e3);
    if (to === 'quoted') return;
    approveQuote(st, l, day + 10800e3);
    if (to === 'approved') return;
    setStatus(st, l, 'in_progress', day + 86400e3);
    if (to === 'in_progress') return;
    setStatus(st, l, 'completed', day + 2 * 86400e3);
    (pays || []).forEach(p => addPayment(st, l, p.type || 'payment', p.amt, p.method || 'העברה בנקאית', day + 2.2 * 86400e3));
  };
  adv(1, 'p3', 'quoted', 850);
  adv(2, 'p2', 'accepted');
  adv(3, 'p6', 'approved', 1400);
  adv(4, 'p4', 'in_progress', 38000);
  adv(5, 'p7', 'completed', 450, [{ amt: 450 * 1.18 }]);
  adv(6, 'p5', 'completed', 700, [{ amt: 700 * 1.18 }]);
  adv(7, 'p8', 'completed', 6200, [{ amt: 3000 }]);
  adv(8, 'p10', 'completed', 3900, [{ amt: 3900 * 1.18 }]);
  adv(9, 'p11', 'completed', 600, [{ amt: 600 * 1.18 }, { type: 'refund', amt: 150, method: 'זיכוי לכרטיס' }]);
  adv(10, 'p12', 'completed', 92000, [{ amt: 92000 * 1.18 }]);
  adv(11, 'p9', 'completed', 2400, [{ amt: 2400 * 1.18 }]);
  leads[5].commission.status = 'collected';
  leads[10].commission.status = 'collected';
  leads[11].commission = { status: 'disputed', dispute: 'חלק מהעבודה (שתילה) בוצע על ידי קבלן משנה של הלקוח, ולכן העמלה צריכה להיות רק על הגיזום.', disputeAt: now() - 20 * DAY };
  leads[5].review = { stars: 5, text: 'הגיע תוך 20 דקות. שירות מעולה.', at: now() - 4 * DAY };
  st.complaints.push(
    { id: uid('c'), leadId: leads[9].id, from: 'customer', type: 'איכות עבודה', text: 'הסתימה חזרה אחרי יומיים. ביקשתי החזר חלקי.', status: 'resolved', at: now() - 14 * DAY, resolution: 'בוצע החזר חלקי של ₪150 והספק חזר לטפל.' },
    { id: uid('c'), leadId: leads[7].id, from: 'customer', type: 'עיכוב', text: 'הספק הבטיח לסיים תוך יום ולקח 4 ימים. נשאר לשלם ₪4,316 ואני מחכה לחשבונית.', status: 'open', at: now() - 6 * DAY }
  );
  return st;
}

/* ---------- matching engine ---------- */
const WEIGHTS = { geo: .30, avail: .25, quality: .20, accept: .15, fair: .10 };
const WEIGHT_NAMES = { geo: 'קרבה גאוגרפית', avail: 'זמינות', quality: 'איכות שירות', accept: 'שיעור היענות', fair: 'חלוקה הוגנת' };

function missingFields(lead) {
  const m = [];
  if (!lead.customer.name.trim()) m.push('שם הלקוח');
  if (!validPhone(lead.customer.phone || '')) m.push('טלפון תקין');
  if (!CAT[lead.cat]) m.push('תחום שירות');
  if (!CITY_REGION[lead.city]) m.push('עיר');
  if (!lead.desc || lead.desc.trim().length < 8) m.push('תיאור העבודה');
  return m;
}

function evaluate(st, lead) {
  const region = CITY_REGION[lead.city];
  const cat = CAT[lead.cat];
  const rows = st.providers.map(p => {
    const fails = [];
    if (!p.cats.includes(lead.cat)) fails.push('לא בתחום');
    const inCity = p.cities.includes(lead.city), inRegion = p.regions.includes(region);
    if (!inCity && !inRegion) fails.push('מחוץ לאזור השירות');
    if (!p.approved) fails.push('טרם אושר');
    if (!p.active) fails.push('מושעה');
    if (cat && cat.license && !p.licenseVerified) fails.push('רישיון לא אומת');
    if (!p.available) fails.push('לא זמין');
    return { p, fails, inCity, inRegion };
  });
  const elig = rows.filter(r => !r.fails.length);
  const maxOff = Math.max(1, ...elig.map(r => r.p.offers30));
  const urgH = URGENCY[lead.urgency].hours;
  rows.forEach(r => {
    if (r.fails.length) { r.score = 0; r.parts = null; return; }
    const p = r.p;
    const parts = {
      geo: r.inCity ? 1 : 0.6,
      avail: p.nextSlotH <= urgH ? 1 : clamp(urgH / p.nextSlotH, 0.2, 1),
      quality: clamp((p.rating - 3) / 2),
      accept: clamp(p.acceptRate),
      fair: elig.length > 1 ? clamp(1 - p.offers30 / maxOff + 0.15) : 1
    };
    r.parts = parts;
    r.score = Object.keys(WEIGHTS).reduce((a, k) => a + WEIGHTS[k] * parts[k], 0);
  });
  rows.sort((a, b) => (b.score - a.score) || (a.fails.length - b.fails.length));
  return rows;
}

/** Runs a lead through validation → consent gate → matching. */
function intake(st, lead, silent, at) {
  const miss = missingFields(lead);
  if (miss.length) { lead.status = 'pending_info'; log(lead, 'הבקשה לא שובצה – חסרים: ' + miss.join(', '), at); return { ok: false, reason: 'missing', miss }; }
  if (!lead.consent) { lead.status = 'no_consent'; log(lead, 'הבקשה לא הועברה – אין הסכמת לקוח לשיתוף', at); return { ok: false, reason: 'consent' }; }
  return runMatch(st, lead, silent, at);
}
function runMatch(st, lead, silent, at) {
  const rows = evaluate(st, lead).filter(r => !r.fails.length && !lead.offers.find(o => o.pid === r.p.id && o.status === 'rejected'));
  const pick = rows.slice(0, MAX_OFFERS);
  if (!pick.length) { lead.status = 'unmatched'; log(lead, 'לא נמצא בעל מקצוע מתאים – הועבר לטיפול ידני', at); return { ok: false, reason: 'none' }; }
  pick.forEach(r => {
    if (lead.offers.find(o => o.pid === r.p.id)) return;
    lead.offers.push({ pid: r.p.id, status: 'pending', score: r.score, at: at || now() });
    r.p.offers30++;
  });
  lead.status = 'matched';
  log(lead, `נשלח ל־${pick.length} בעלי מקצוע מתאימים (התראה פנימית בלבד)`, at);
  return { ok: true, count: pick.length };
}
function log(lead, text, at) { lead.history.push({ at: at || now(), text }); }

/* ---------- job workflow ---------- */
function accept(st, lead, pid, at) {
  if (lead.assignedTo) return false;
  lead.offers.forEach(o => { o.status = o.pid === pid ? 'accepted' : (o.status === 'pending' ? 'closed' : o.status); });
  lead.assignedTo = pid; lead.status = 'accepted';
  const p = prov(st, pid); log(lead, `${p.business} קיבל את העבודה. פרטי הלקוח נחשפו לו`, at);
  return true;
}
function reject(st, lead, pid, reason) {
  const o = lead.offers.find(o => o.pid === pid); if (!o) return;
  o.status = 'rejected'; o.reason = reason;
  const p = prov(st, pid); p.acceptRate = clamp(p.acceptRate * 0.97);
  log(lead, `${p.business} דחה את הבקשה${reason ? ' (' + reason + ')' : ''}`);
  if (!lead.offers.some(o => o.status === 'pending') && !lead.assignedTo) runMatch(st, lead);
}
function manualAssign(st, lead, pid) {
  if (!lead.offers.find(o => o.pid === pid)) lead.offers.push({ pid, status: 'pending', score: 0, at: now(), manual: true });
  lead.assignedTo = null;
  accept(st, lead, pid);
  log(lead, 'השיבוץ בוצע ידנית על ידי מנהל');
}
function submitQuote(st, lead, amountExVat, note, at) {
  lead.quote = { amount: +amountExVat, note: note || '', at: at || now() };
  lead.status = 'quoted';
  log(lead, `הצעת מחיר: ${ils(amountExVat)} + מע״מ`, at);
}
function approveQuote(st, lead, at) { lead.status = 'approved'; log(lead, 'הלקוח אישר את הצעת המחיר', at); }
function setStatus(st, lead, s, at) {
  lead.status = s;
  log(lead, 'סטטוס עודכן: ' + STATUS[s].name, at);
  if (s === 'completed' || s === 'cancelled') syncCommission(lead);
}
function addPayment(st, lead, type, amountInclVat, method, at) {
  lead.payments.push({ id: uid('pay'), type, amount: +amountInclVat, method, at: at || now(), simulated: true });
  log(lead, `${type === 'refund' ? 'החזר' : 'תשלום'} מדומה נרשם: ${ils(amountInclVat)} כולל מע״מ (${method})`, at);
  syncCommission(lead);
  const pay = payInfo(lead);
  if (lead.status === 'completed' && pay.state === 'full') { lead.status = 'closed'; log(lead, 'העבודה שולמה במלואה ונסגרה', at); }
}

/* ---------- commission engine ---------- */
function payInfo(lead) {
  const paid = lead.payments.filter(p => p.type === 'payment').reduce((a, p) => a + p.amount, 0);
  const refunded = lead.payments.filter(p => p.type === 'refund').reduce((a, p) => a + p.amount, 0);
  const net = paid - refunded;
  const due = lead.quote ? lead.quote.amount * (1 + VAT) : 0;
  let state = 'none';
  if (refunded > 0 && net <= 0.5) state = 'refunded';
  else if (due && net >= due - 0.5) state = 'full';
  else if (net > 0) state = 'partial';
  return { paid, refunded, net, due, balance: Math.max(0, due - net), state };
}
const PAY_STATE = { none: ['לא שולם', 'plain'], partial: ['שולם חלקית', 'warn'], full: ['שולם במלואו', 'ok'], refunded: ['הוחזר', 'bad'] };

function rateFor(st, lead, baseExVat) {
  const p = prov(st, lead.assignedTo);
  const projectSize = lead.quote ? lead.quote.amount : baseExVat;
  if (projectSize >= LARGE_PROJECT_THRESHOLD) return { rate: st.largeRate, source: `פרויקט גדול (מעל ${ils(LARGE_PROJECT_THRESHOLD)})` };
  if (lead.commission.rateOverride != null) return { rate: lead.commission.rateOverride, source: 'תעריף שנקבע ביישוב מחלוקת' };
  if (p && p.agreementRate != null) return { rate: p.agreementRate, source: 'הסכם אישי עם בעל המקצוע' };
  return { rate: st.catRates[lead.cat], source: `תעריף קטגוריה · ${TIERS[CAT[lead.cat].tier].name}` };
}
/** Commission is computed on money actually received, net of refunds, excluding VAT. */
function commissionOf(st, lead) {
  const pay = payInfo(lead);
  const base = Math.max(0, pay.net) / (1 + VAT);
  const { rate, source } = rateFor(st, lead, base);
  const waived = lead.commission.status === 'waived';
  const amount = waived ? 0 : base * rate / 100;
  return { base, rate, source, amount, vatPart: Math.max(0, pay.net) - base, pay };
}
function syncCommission(lead) {
  const c = lead.commission;
  if (['collected', 'disputed', 'waived'].includes(c.status)) return;
  const pay = payInfo(lead);
  if (pay.net <= 0) c.status = lead.payments.length ? 'waived' : (lead.status === 'cancelled' ? 'waived' : 'none');
  else c.status = (lead.status === 'completed' || lead.status === 'closed' || lead.status === 'cancelled') ? 'due' : 'accruing';
}

/* ---------- store ---------- */
const KEY = 'pronetwork-demo-v1';
let S;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); if (d && d.ver === 1) return d; } } catch (e) {}
  return seed();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked: keep working in memory */ } }
function resetDemo() { S = seed(); save(); }
const prov = (st, id) => st.providers.find(p => p.id === id);
const lead = (id) => S.leads.find(l => l.id === id);
