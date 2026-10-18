/**
 * איתור כפילויות בנתוני יומן ההדברה.
 *
 * הקובץ הזה מכיל את הלוגיקה בלבד, בלי קריאה למסד נתונים ובלי מחיקות,
 * כדי שניתן יהיה להריץ אותה גם על גיבוי וגם על מסד השרת, ולבדוק אותה
 * בבדיקות אוטומטיות.
 *
 * שלוש דרגות סיווג:
 *   certain  – כפילות ודאית לפי כלל עסקי חד-משמעי (למשל שתי חתימות
 *              באותו תפקיד לאותו יומן).
 *   possible – חשד שדורש עין אנושית (למשל אותו שם לקוח בכתובת אחרת).
 *   separate – נראה דומה אך אינו כפילות, ומוצג כדי שלא יימחק בטעות.
 */

const NOT_ENTERED = 'לא הוזן';

/** השוואת טקסט חופשי: רווחים, גרשיים וסימנים לא משפיעים. */
export function normalizeText(value) {
  return String(value ?? '')
    .replace(/[״"'`׳]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** ספרות הטלפון בלבד, עם קידומת ישראלית מנורמלת. */
export function normalizePhone(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00972')) d = d.slice(5);
  else if (d.startsWith('972')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.length >= 8 ? `972${d}` : '';
}

function group(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1);
}

function finding(kind, level, title, why, rows, fields) {
  return {
    kind,
    level,
    title,
    why,
    count: rows.length,
    rows: rows.map((r) => {
      const out = { id: r.id };
      for (const f of fields) out[f] = r[f];
      return out;
    }),
  };
}

/**
 * data: אובייקט עם האוספים { customers, journals, journalMaterials, ... }
 * כפי שהם במצב האפליקציה או בגיבוי.
 */
export function findDuplicates(data) {
  const findings = [];
  const customers = data.customers ?? [];
  const journals = data.journals ?? [];
  const materials = data.materials ?? [];
  const journalMaterials = data.journalMaterials ?? [];
  const journalPests = data.journalPests ?? [];
  const journalActions = data.journalActions ?? [];
  const signatures = data.signatures ?? [];
  const snapshots = data.journalSnapshots ?? [];
  const routes = data.routes ?? [];
  const routeStops = data.routeStops ?? [];
  const tasks = data.tasks ?? [];
  const templates = data.customerTemplates ?? [];

  /* ───────── יומנים ───────── */

  // מספר יומן חייב להיות ייחודי בעסק. שני יומנים באותו מספר הם תקלה.
  for (const [number, list] of group(journals, (j) => `num:${j.journalNumber}`)) {
    findings.push(finding(
      'journals', 'certain',
      `שני יומנים או יותר עם אותו מספר (${number.slice(4)})`,
      'מספר היומן אמור להיות ייחודי. בדרך כלל נובע משתי יצירות באותו רגע.',
      list, ['journalNumber', 'status', 'customerId', 'startedAt', 'createdAt'],
    ));
  }

  /* אותו לקוח, אותו תאריך ביצוע ואותה דקת יצירה – חשד לשמירה כפולה.
     אותו לקוח באותו יום בשעות שונות הוא מצב אמיתי ואינו כפילות. */
  const minute = (iso) => String(iso ?? '').slice(0, 16);
  for (const [, list] of group(
    journals.filter((j) => j.customerId),
    (j) => `dup:${j.customerId}|${minute(j.startedAt)}|${minute(j.createdAt)}`,
  )) {
    findings.push(finding(
      'journals', 'possible',
      'שני יומנים לאותו לקוח שנוצרו באותה דקה',
      'ייתכן שמדובר בלחיצה כפולה. יש לבדוק אם אחד מהם ריק.',
      list, ['journalNumber', 'status', 'startedAt', 'createdAt'],
    ));
  }

  // טיוטות ריקות: נוצרו ולא נגעו בהן. אינן כפילות, אך מצטברות.
  const touched = new Set([
    ...journalMaterials.map((m) => m.journalId),
    ...journalPests.map((p) => p.journalId),
    ...journalActions.map((a) => a.journalId),
    ...signatures.map((s) => s.journalId),
  ]);
  const emptyDrafts = journals.filter(
    (j) => j.status === 'draft' && !j.customerId && !touched.has(j.id),
  );
  if (emptyDrafts.length > 0) {
    findings.push(finding(
      'journals', 'separate',
      `${emptyDrafts.length} טיוטות ריקות ללא לקוח וללא תיעוד`,
      'אינן כפילות ואינן נמחקות אוטומטית. אפשר לארכב אותן בבדיקה ידנית.',
      emptyDrafts, ['journalNumber', 'createdAt'],
    ));
  }

  // יותר מצילום אחד לאותו יומן – המסמך הסופי אמור להיות אחד
  for (const [, list] of group(snapshots, (s) => `snap:${s.journalId}`)) {
    findings.push(finding(
      'journalSnapshots', 'certain',
      'יותר מצילום אחד לאותו יומן',
      'לכל יומן אמור להיות מסמך סופי אחד.',
      list, ['journalId', 'takenAt', 'journalNumber'],
    ));
  }

  /* ───────── לקוחות ───────── */

  for (const [, list] of group(
    customers,
    (c) => `exact:${normalizeText(c.name)}|${normalizeText(c.address)}`,
  )) {
    findings.push(finding(
      'customers', 'certain',
      `אותו שם ואותה כתובת: ${list[0].name}`,
      'שם וכתובת זהים לאחר נרמול. כמעט בוודאות אותו לקוח.',
      list, ['customerNumber', 'name', 'phone', 'address', 'createdAt'],
    ));
  }

  for (const [, list] of group(
    customers.filter((c) => normalizePhone(c.phone)),
    (c) => `phone:${normalizePhone(c.phone)}`,
  )) {
    const names = new Set(list.map((c) => normalizeText(c.name)));
    const addresses = new Set(list.map((c) => normalizeText(c.address)));
    if (names.size === 1 && addresses.size === 1) continue;   // כבר דווח כוודאי
    findings.push(finding(
      'customers', 'possible',
      `אותו טלפון בשמות או כתובות שונים: ${list.map((c) => c.name).join(' / ')}`,
      'ייתכן אותו לקוח שהוזן פעמיים, וייתכנו שני לקוחות שחולקים טלפון.',
      list, ['customerNumber', 'name', 'phone', 'address'],
    ));
  }

  for (const [, list] of group(
    customers,
    (c) => (normalizeText(c.name) ? `name:${normalizeText(c.name)}` : ''),
  )) {
    const addresses = new Set(list.map((c) => normalizeText(c.address)));
    if (addresses.size <= 1) continue;   // דווח כוודאי
    findings.push(finding(
      'customers', 'possible',
      `אותו שם בכתובות שונות: ${list[0].name}`,
      'יכולים להיות סניפים נפרדים של אותו לקוח, ויכולה להיות כפילות.',
      list, ['customerNumber', 'name', 'address'],
    ));
  }

  const sameAddress = group(
    customers,
    (c) => (normalizeText(c.address) ? `addr:${normalizeText(c.address)}` : ''),
  ).filter(([, list]) => new Set(list.map((c) => normalizeText(c.name))).size > 1);
  for (const [, list] of sameAddress) {
    findings.push(finding(
      'customers', 'separate',
      `כמה לקוחות באותה כתובת: ${list.map((c) => c.name).join(' / ')}`,
      'מצב אמיתי ושכיח (בניין, קניון). אינו כפילות.',
      list, ['customerNumber', 'name', 'address'],
    ));
  }

  /* ───────── תכשירים ───────── */

  for (const [, list] of group(
    materials.filter((m) => m.registrationNumber && m.registrationNumber !== NOT_ENTERED),
    (m) => `reg:${normalizeText(m.registrationNumber)}`,
  )) {
    findings.push(finding(
      'materials', 'certain',
      `אותו מספר רישום במזהים שונים: ${list[0].registrationNumber}`,
      'מספר רישום מזהה תכשיר אחד. שתי רשומות לאותו מספר הן אותו תכשיר.',
      list, ['tradeName', 'registrationNumber'],
    ));
  }

  for (const [, list] of group(materials, (m) => `name:${normalizeText(m.tradeName)}`)) {
    const regs = new Set(
      list.map((m) => normalizeText(m.registrationNumber)).filter((r) => r && r !== normalizeText(NOT_ENTERED)),
    );
    if (regs.size > 1) {
      findings.push(finding(
        'materials', 'separate',
        `אותו שם מסחרי במספרי רישום שונים: ${list[0].tradeName}`,
        'תכשירים שונים. אין למזג אותם.',
        list, ['tradeName', 'registrationNumber'],
      ));
    } else {
      findings.push(finding(
        'materials', 'possible',
        `אותו שם מסחרי: ${list[0].tradeName}`,
        'אחת הרשומות ללא מספר רישום. סביר שמדובר באותו תכשיר.',
        list, ['tradeName', 'registrationNumber'],
      ));
    }
  }

  /* ───────── רשומות בתוך יומן ───────── */

  for (const [, list] of group(journalMaterials, (m) => `jm:${m.journalId}|${m.materialId}`)) {
    findings.push(finding(
      'journalMaterials', 'possible',
      'אותו תכשיר נרשם פעמיים באותו יומן',
      'ייתכן שימוש אמיתי בשתי אצוות, וייתכנה בחירה כפולה.',
      list, ['journalId', 'materialNameSnapshot'],
    ));
  }

  for (const [, list] of group(journalPests, (p) => `jp:${p.journalId}|${p.pestId}`)) {
    findings.push(finding(
      'journalPests', 'certain',
      'אותו מזיק נרשם פעמיים באותו יומן',
      'מזיק מופיע פעם אחת לכל יומן.',
      list, ['journalId', 'pestId'],
    ));
  }

  for (const [, list] of group(journalActions, (a) => `ja:${a.journalId}|${a.kind}`)) {
    findings.push(finding(
      'journalActions', 'certain',
      'אותה פעולת טיפול נרשמה פעמיים באותו יומן',
      'פעולה מופיעה פעם אחת לכל יומן.',
      list, ['journalId', 'kind'],
    ));
  }

  for (const [, list] of group(signatures, (s) => `sg:${s.journalId}|${s.role}`)) {
    findings.push(finding(
      'signatures', 'certain',
      'שתי חתימות באותו תפקיד לאותו יומן',
      'לכל תפקיד חתימה אחת.',
      list, ['journalId', 'role', 'signedAt'],
    ));
  }

  /* ───────── מסלולים, תחנות, משימות ותבניות ───────── */

  for (const [, list] of group(routes, (r) => `route:${r.date}`)) {
    findings.push(finding(
      'routes', 'certain',
      `יותר ממסלול אחד לאותו תאריך: ${list[0].date}`,
      'המסך מציג מסלול אחד ליום, ולכן מסלול נוסף נשאר מוסתר.',
      list, ['date', 'name', 'createdAt'],
    ));
  }

  for (const [, list] of group(routeStops, (st) => `stop:${st.routeId}|${st.customerId}`)) {
    findings.push(finding(
      'routeStops', 'possible',
      'אותו לקוח מופיע פעמיים באותו מסלול',
      'ייתכנו שתי תחנות אמיתיות (בוקר וערב), וייתכנה הוספה כפולה.',
      list, ['routeId', 'customerId', 'position'],
    ));
  }

  for (const [, list] of group(
    tasks,
    (t) => `task:${normalizeText(t.title)}|${t.dueDate}|${t.customerId ?? ''}`,
  )) {
    findings.push(finding(
      'tasks', 'possible',
      `אותה משימה לאותו תאריך: ${list[0].title}`,
      'ייתכנה הוספה כפולה.',
      list, ['title', 'dueDate', 'customerId'],
    ));
  }

  for (const [, list] of group(
    templates,
    (t) => `tpl:${t.customerId}|${normalizeText(t.name)}`,
  )) {
    findings.push(finding(
      'customerTemplates', 'certain',
      `אותה תבנית לקוח נשמרה פעמיים: ${list[0].name}`,
      'תבנית באותו שם לאותו לקוח היא אותה תבנית.',
      list, ['name', 'customerId', 'createdAt'],
    ));
  }

  const order = { certain: 0, possible: 1, separate: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level] || a.kind.localeCompare(b.kind));
  return findings;
}

export function summarize(findings) {
  const byLevel = { certain: 0, possible: 0, separate: 0 };
  const byKind = {};
  for (const f of findings) {
    byLevel[f.level] += 1;
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  }
  return { total: findings.length, byLevel, byKind };
}

export const LEVEL_LABEL = {
  certain: 'כפילות ודאית',
  possible: 'כפילות אפשרית',
  separate: 'רשומות נפרדות',
};
