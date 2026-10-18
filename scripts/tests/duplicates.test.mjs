/**
 * בדיקות לכלי איתור הכפילויות. הכלי הוא דוח בלבד, ולכן הבדיקה
 * מתמקדת בסיווג: מה ודאי, מה אפשרי, ומה דווקא אינו כפילות.
 */

import { findDuplicates, normalizePhone, normalizeText, summarize } from '../lib/duplicates.mjs';
import { planCustomerMerge } from '../lib/mergeCustomers.mjs';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`PASS · ${name}${detail ? ' · ' + detail : ''}`); }
  else { fail += 1; console.log(`FAIL · ${name}${detail ? ' · ' + detail : ''}`); }
};

const of = (findings, kind, level) =>
  findings.filter((f) => f.kind === kind && f.level === level);

/* ───── נרמול ───── */
check('נרמול טקסט מתעלם מגרשיים ורווחים',
  normalizeText('מסעדת  הגפן בע״מ') === normalizeText('מסעדת הגפן בעמ'));
check('נרמול טלפון מאחד צורות כתיבה',
  normalizePhone('050-1234567') === normalizePhone('+972501234567'),
  normalizePhone('050-1234567'));
check('מספר קצר מדי אינו מנורמל', normalizePhone('123') === '');

/* ───── יומנים ───── */
{
  const findings = findDuplicates({
    journals: [
      { id: 'j1', journalNumber: 7, status: 'completed', customerId: 'c1', startedAt: '2026-01-01T08:00', createdAt: '2026-01-01T08:00' },
      { id: 'j2', journalNumber: 7, status: 'draft', customerId: 'c2', startedAt: '2026-02-01T08:00', createdAt: '2026-02-01T08:00' },
    ],
  });
  check('שני יומנים באותו מספר הם כפילות ודאית', of(findings, 'journals', 'certain').length === 1);
}
{
  const findings = findDuplicates({
    journals: [
      { id: 'j1', journalNumber: 1, status: 'draft', customerId: 'c1', startedAt: '2026-01-01T08:00', createdAt: '2026-01-01T08:00:01' },
      { id: 'j2', journalNumber: 2, status: 'draft', customerId: 'c1', startedAt: '2026-01-01T08:00', createdAt: '2026-01-01T08:00:02' },
    ],
  });
  check('אותו לקוח באותה דקה הוא חשד בלבד',
    of(findings, 'journals', 'possible').length === 1);
}
{
  const findings = findDuplicates({
    journals: [
      { id: 'j1', journalNumber: 1, status: 'completed', customerId: 'c1', startedAt: '2026-01-01T08:00', createdAt: '2026-01-01T08:00' },
      { id: 'j2', journalNumber: 2, status: 'completed', customerId: 'c1', startedAt: '2026-01-01T14:00', createdAt: '2026-01-01T14:00' },
    ],
  });
  check('שני טיפולים לאותו לקוח באותו יום בשעות שונות אינם כפילות',
    findings.length === 0, `ממצאים: ${findings.length}`);
}
{
  const findings = findDuplicates({
    journals: [{ id: 'j1', journalNumber: 1, status: 'draft', createdAt: '2026-01-01' }],
  });
  check('טיוטה ריקה מדווחת כרשומה נפרדת ולא כככפילות',
    of(findings, 'journals', 'separate').length === 1);
}
{
  const findings = findDuplicates({
    journalSnapshots: [
      { id: 's1', journalId: 'j1', takenAt: '2026-01-01', journalNumber: 1 },
      { id: 's2', journalId: 'j1', takenAt: '2026-01-02', journalNumber: 1 },
    ],
  });
  check('שני צילומים לאותו יומן הם כפילות ודאית',
    of(findings, 'journalSnapshots', 'certain').length === 1);
}

/* ───── לקוחות ───── */
{
  const findings = findDuplicates({
    customers: [
      { id: 'c1', customerNumber: '1001', name: 'מסעדת הגפן', address: 'הרצל 10, תל אביב', phone: '0501234567' },
      { id: 'c2', customerNumber: '1002', name: 'מסעדת הגפן', address: 'הרצל 10 תל-אביב', phone: '' },
    ],
  });
  check('אותו שם ואותה כתובת – כפילות ודאית',
    of(findings, 'customers', 'certain').length === 1);
}
{
  const findings = findDuplicates({
    customers: [
      { id: 'c1', customerNumber: '1001', name: 'בניין רימון', address: 'האלון 3, חיפה' },
      { id: 'c2', customerNumber: '1002', name: 'מרפאה', address: 'האלון 3, חיפה' },
    ],
  });
  check('שני לקוחות באותה כתובת מסומנים כנפרדים',
    of(findings, 'customers', 'separate').length === 1 && of(findings, 'customers', 'certain').length === 0);
}
{
  const findings = findDuplicates({
    customers: [
      { id: 'c1', customerNumber: '1001', name: 'א', address: 'רחוב 1', phone: '050-1111111' },
      { id: 'c2', customerNumber: '1002', name: 'ב', address: 'רחוב 2', phone: '+972501111111' },
    ],
  });
  check('אותו טלפון בשמות שונים – חשד בלבד',
    of(findings, 'customers', 'possible').length === 1);
}

/* ───── תכשירים ───── */
{
  const findings = findDuplicates({
    materials: [
      { id: 'gov_640', tradeName: 'דרגון', registrationNumber: '640' },
      { id: 'gov_640_0', tradeName: 'דרגון', registrationNumber: '640' },
    ],
  });
  check('אותו מספר רישום – כפילות ודאית',
    of(findings, 'materials', 'certain').length === 1);
}
{
  const findings = findDuplicates({
    materials: [
      { id: 'a', tradeName: 'בלוקיון פלוס', registrationNumber: '585' },
      { id: 'b', tradeName: 'בלוקיון פלוס', registrationNumber: '999' },
    ],
  });
  check('אותו שם במספרי רישום שונים – תכשירים נפרדים',
    of(findings, 'materials', 'separate').length === 1 && of(findings, 'materials', 'certain').length === 0);
}

/* ───── רשומות בתוך יומן ───── */
{
  const findings = findDuplicates({
    journalPests: [
      { id: 'p1', journalId: 'j1', pestId: 'rat' },
      { id: 'p2', journalId: 'j1', pestId: 'rat' },
    ],
    signatures: [
      { id: 's1', journalId: 'j1', role: 'customer', signedAt: 'x' },
      { id: 's2', journalId: 'j1', role: 'customer', signedAt: 'y' },
    ],
    journalMaterials: [
      { id: 'm1', journalId: 'j1', materialId: 'mat', materialNameSnapshot: 'דרגון' },
      { id: 'm2', journalId: 'j1', materialId: 'mat', materialNameSnapshot: 'דרגון' },
    ],
  });
  check('מזיק כפול וחתימה כפולה הם ודאיים',
    of(findings, 'journalPests', 'certain').length === 1
    && of(findings, 'signatures', 'certain').length === 1);
  check('אותו תכשיר פעמיים ביומן הוא חשד בלבד (שתי אצוות אפשריות)',
    of(findings, 'journalMaterials', 'possible').length === 1);
}

/* ───── מסלולים ───── */
{
  const findings = findDuplicates({
    routes: [
      { id: 'r1', date: '2026-01-01', name: 'א', createdAt: 'x' },
      { id: 'r2', date: '2026-01-01', name: 'ב', createdAt: 'y' },
    ],
  });
  check('שני מסלולים לאותו תאריך – ודאי',
    of(findings, 'routes', 'certain').length === 1);
}

/* ───── מצב נקי ───── */
{
  const findings = findDuplicates({
    customers: [{ id: 'c1', customerNumber: '1001', name: 'א', address: 'רחוב 1' }],
    journals: [{ id: 'j1', journalNumber: 1, status: 'completed', customerId: 'c1', startedAt: '2026-01-01', createdAt: '2026-01-01' }],
  });
  check('נתונים נקיים אינם מפיקים ממצאים', findings.length === 0, `ממצאים: ${findings.length}`);
  const stats = summarize(findings);
  check('הסיכום מחזיר אפסים', stats.total === 0 && stats.byLevel.certain === 0);
}

/* ───── תוכנית מיזוג לקוחות ───── */
{
  const docs = [
    { entity: 'customers', entityId: 'c1', orgId: 'o1', payload: { customerNumber: '1001', name: 'מסעדת הגפן', address: 'הרצל 10', phone: '', notes: '' } },
    { entity: 'customers', entityId: 'c2', orgId: 'o1', payload: { customerNumber: '1007', name: 'מסעדת הגפן', address: 'הרצל 10', phone: '050-1234567', contactName: 'דנה' } },
    { entity: 'journals', entityId: 'j1', orgId: 'o1', payload: { customerId: 'c2', journalNumber: 3 } },
    { entity: 'tasks', entityId: 't1', orgId: 'o1', payload: { customerId: 'c2', title: 'ביקורת' } },
    { entity: 'bait_stations', entityId: 'b1', orgId: 'o1', payload: { customerId: 'c2', stationCode: 'T-1' } },
    { entity: 'journals', entityId: 'j2', orgId: 'o1', payload: { customerId: 'c1', journalNumber: 4 } },
  ];

  const plan = planCustomerMerge(docs, 'c1', 'c2');
  check('תוכנית המיזוג נבנתה', plan.ok === true);
  check('ההפניות של הלקוח שמוזג מועברות', plan.moves.length === 3, `הפניות: ${plan.moves.length}`);
  check('ההפניות של הלקוח שנשמר אינן נוגעות',
    plan.moves.every((m) => m.entityId !== 'j2'));
  check('שדה ריק אצל הנשמר מתמלא מהמוזג',
    plan.keep.payload.phone === '050-1234567' && plan.filled.includes('phone'));
  check('הלקוח שמוזג מסומן כמאורכב ואינו נמחק',
    plan.merged.payload.archived === true && plan.merged.payload.name === 'מסעדת הגפן');
  check('בהערה של המוזג מופיעה הפניה ללקוח שנשמר',
    String(plan.merged.payload.notes).includes('1001'));

  const conflicting = [
    { entity: 'customers', entityId: 'c1', orgId: 'o1', payload: { customerNumber: '1001', name: 'א', address: 'הרצל 10', phone: '050-1111111' } },
    { entity: 'customers', entityId: 'c2', orgId: 'o1', payload: { customerNumber: '1002', name: 'א', address: 'הרצל 10', phone: '050-2222222' } },
  ];
  const plan2 = planCustomerMerge(conflicting, 'c1', 'c2');
  check('ערך שונה אינו נדרס אלא נשמר כהערה',
    plan2.keep.payload.phone === '050-1111111'
    && String(plan2.keep.payload.notes).includes('050-2222222'));

  const crossOrg = [
    { entity: 'customers', entityId: 'c1', orgId: 'o1', payload: { name: 'א', address: 'x' } },
    { entity: 'customers', entityId: 'c2', orgId: 'o2', payload: { name: 'א', address: 'x' } },
  ];
  check('מיזוג בין עסקים שונים נדחה', planCustomerMerge(crossOrg, 'c1', 'c2').ok === false);
  check('מיזוג של רשומה עם עצמה נדחה', planCustomerMerge(docs, 'c1', 'c1').ok === false);
  check('מזהה שאינו קיים נדחה', planCustomerMerge(docs, 'c1', 'nope').ok === false);
}

console.log(`\n═══ ${pass} עברו, ${fail} נכשלו ═══`);
process.exit(fail ? 1 : 0);
