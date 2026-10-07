/**
 * זיהוי עמודות במאגר הרשמי. המאגר מתפרסם בכמה תצורות ובכותרות משתנות,
 * ולכן ההתאמה נעשית לפי מילות מפתח ולא לפי שם עמודה קשיח.
 */

const CANDIDATES = {
  tradeName: ['שם התכשיר', 'שם תכשיר', 'שם מסחרי', 'שם המוצר', 'תכשיר',
    'product', 'tradename', 'trade name', 'name', 'tachshir', 'shem'],
  registrationNumber: ['מספר רישום', "מס' רישום", 'מספר היתר', 'מספר רשיון', 'מספר רישיון',
    'registration', 'regno', 'license', 'rishum', 'rishayon'],
  activeIngredient: ['חומר פעיל', 'חומרים פעילים', 'החומר הפעיל',
    'active ingredient', 'activeingredient', 'active', 'homer paeil', 'homer', 'paeil'],
  concentration: ['ריכוז', 'אחוז החומר הפעיל', 'אחוז', 'concentration', 'percent', 'rikuz'],
  formulation: ['תוארית', 'תצורה', 'פורמולציה', 'formulation', 'סוג תכשיר', 'toarit'],
  pests: ['מזיק', 'מזיקים', 'יעד', 'מטרה', 'pest', 'target', 'mazik'],
  holder: ['בעל הרישום', 'בעל רישום', 'יצרן', 'חברה', 'משווק', 'holder', 'company', 'manufacturer'],
  validUntil: ['תוקף', 'בתוקף עד', 'תאריך תפוגה', 'תפוגה', 'expiry', 'valid'],
  labelUrl: ['תווית', 'קישור', 'label', 'url', 'link', 'pdf'],
  usage: ['שימוש', 'תחום', 'ייעוד', 'usage', 'use'],
};

const normalize = (s) =>
  String(s ?? '').toLowerCase().replace(/["'`׳״]/g, '').replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();

/** מחזיר מיפוי משדה לוגי לשם העמודה שנמצאה בפועל. */
export function detectColumns(headers) {
  const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) }));
  const mapping = {};
  for (const [field, keys] of Object.entries(CANDIDATES)) {
    // התאמה מלאה עדיפה על התאמה חלקית
    let hit = normalized.find((h) => keys.some((k) => h.norm === normalize(k)));
    if (!hit) hit = normalized.find((h) => keys.some((k) => h.norm.includes(normalize(k))));
    if (hit && !Object.values(mapping).includes(hit.raw)) mapping[field] = hit.raw;
  }
  return mapping;
}

/** מאתר את מערך הרשומות בתוך תשובת JSON בעלת מבנה לא ידוע. */
export function findRecords(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  const keys = ['results', 'Results', 'items', 'Items', 'data', 'Data', 'records', 'value'];
  for (const k of keys) {
    if (Array.isArray(json[k])) return json[k];
  }
  // חיפוש עמוק: המערך הגדול ביותר של אובייקטים
  let best = [];
  const visit = (node, depth) => {
    if (depth > 4 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.length > best.length && node.every((x) => x && typeof x === 'object')) best = node;
      return;
    }
    for (const v of Object.values(node)) visit(v, depth + 1);
  };
  visit(json, 0);
  return best;
}

/** משטח רשומת JSON מקוננת לשדות פשוטים. */
export function flattenRecord(record) {
  const out = {};
  const visit = (node, prefix, depth) => {
    if (depth > 3 || node === null || node === undefined) return;
    if (typeof node !== 'object') { out[prefix] = String(node); return; }
    if (Array.isArray(node)) {
      out[prefix] = node
        .map((v) => (v && typeof v === 'object' ? Object.values(v).join(' ') : String(v)))
        .join(', ');
      return;
    }
    for (const [k, v] of Object.entries(node)) visit(v, prefix ? `${prefix}.${k}` : k, depth + 1);
  };
  visit(record, '', 0);
  return out;
}
