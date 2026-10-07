/**
 * כללי הוולידציה של היומן – מקור אמת אחד ללקוח ולשרת.
 *
 * הקובץ הזה הוא JavaScript רגיל בכוונה: השרת רץ מקוד המקור ללא
 * שלב בנייה, ולכן אינו יכול לייבא TypeScript. הטיפוסים מוצהרים
 * בקובץ journalRules.d.ts שלידו.
 *
 * שמירת טיוטה אף פעם אינה חסומה. הכללים כאן חלים על סיום יומן.
 */

/** שדות חובה לכל ישות בסנכרון. */
export const REQUIRED_FIELDS = {
  customers: ['name', 'address'],
  journals: ['journalNumber', 'startedAt', 'status'],
  journal_materials: ['journalId', 'materialId'],
  customer_sites: ['customerId', 'address'],
  routes: ['date'],
  route_stops: ['routeId', 'customerId'],
  tasks: ['title', 'dueDate'],
  customer_templates: ['name', 'customerId'],
  signatures: ['journalId', 'role'],
  journal_snapshots: ['journalId', 'takenAt', 'schemaVersion'],
};

/** שדות ביצוע שחייבים להתמלא לפני שיומן מסומן כהושלם. */
export const EXECUTION_FIELDS = [
  'batchNumber', 'packageExpiry', 'chosenDoseText', 'materialAmount', 'coverage',
];

export const JOURNAL_STATUSES = ['draft', 'completed', 'sent', 'needs_completion', 'cancelled'];

const text = (value) => String(value ?? '').trim();

/** האם המחרוזת היא מספר חיובי. ריק אינו נחשב מספר. */
export function isPositiveNumber(value) {
  const raw = text(value).replace(',', '.');
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}

/** האם המחרוזת היא תאריך קריא (YYYY-MM-DD או ISO). */
export function isValidDate(value) {
  const raw = text(value);
  if (!raw) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t);
}

/** האם התאריך עבר ביחס לנקודת הזמן שנמסרה. */
export function isPastDate(value, now = new Date()) {
  if (!isValidDate(value)) return false;
  return Date.parse(text(value)) < now.getTime();
}

/**
 * ביקור ללא תכשיר הוא מצב חוקי: ניטור, איטום, מלכודות, או ביקור
 * שבו הוחלט במפורש לא להשתמש בתכשיר. במצב כזה אין לדרוש נתוני ביצוע.
 */
export function isTreatmentWithoutProduct(journal, actions) {
  if (journal?.noProductUsed) return true;
  const kinds = (actions ?? []).map((a) => a.kind);
  if (kinds.length === 0) return false;
  const withoutProduct = ['monitoring', 'sealing', 'cleaning', 'vacuum', 'traps'];
  return kinds.every((k) => withoutProduct.includes(k));
}

/**
 * כללי הסיום. מחזיר רשימת ממצאים; `blocking` חוסם סיום.
 * `now` נמסר מבחוץ כדי שהבדיקות יהיו דטרמיניסטיות.
 */
export function journalIssues(full, now = new Date()) {
  const { journal, pests, actions, materials, signatures } = full;
  const issues = [];
  const add = (field, message, step, blocking) => issues.push({ field, message, step, blocking });

  if (!text(journal.exterminatorName)) add('exterminatorName', 'חסר שם המדביר.', 1, true);
  if (!text(journal.licenseNumber)) add('licenseNumber', 'חסר מספר רישיון הדברה.', 1, true);

  if (!isValidDate(journal.startedAt)) {
    add('startedAt', 'תאריך ביצוע העבודה אינו תקין.', 1, true);
  } else if (Date.parse(journal.startedAt) > now.getTime() + 24 * 60 * 60 * 1000) {
    add('startedAt', 'תאריך ביצוע העבודה הוא בעתיד. יש לוודא שהתאריך נכון.', 1, false);
  }

  if (!journal.customerId) add('customerId', 'לא נבחר לקוח.', 2, true);
  if (!text(journal.siteAddress)) add('siteAddress', 'חסרה כתובת האתר.', 2, true);
  if ((pests ?? []).length === 0) add('pests', 'לא תועד מזיק.', 3, true);
  if ((actions ?? []).length === 0) add('actions', 'לא תועדה פעולת טיפול.', 4, true);

  const withoutProduct = isTreatmentWithoutProduct(journal, actions);
  const list = materials ?? [];

  if (journal.noProductUsed && list.length > 0) {
    add(
      'noProductUsed',
      'סומן שלא נעשה שימוש בתכשיר, אבל יש תכשיר ביומן. יש להסיר את הסימון או את התכשיר.',
      5, true,
    );
  }

  if (list.length === 0 && !withoutProduct) {
    add(
      'materials',
      'לא נבחר תכשיר. אם לא נעשה שימוש בתכשיר, יש לסמן זאת בשלב 5.',
      5, false,
    );
  }

  if (journal.noProductUsed && !text(journal.noProductReason)) {
    add('noProductReason', 'יש לתעד מדוע לא נעשה שימוש בתכשיר.', 5, true);
  }

  for (const jm of list) {
    const name = jm.materialNameSnapshot;
    const e = jm.execution ?? {};
    if (!text(e.batchNumber)) add(`batch:${jm.id}`, `חסר מספר אצווה עבור ${name}.`, 5, true);

    if (!text(e.packageExpiry)) {
      add(`expiry:${jm.id}`, `חסר תאריך תפוגה על האריזה עבור ${name}.`, 5, true);
    } else if (!isValidDate(e.packageExpiry)) {
      add(`expiry:${jm.id}`, `תאריך התפוגה של ${name} אינו תקין.`, 5, true);
    } else if (isPastDate(e.packageExpiry, now)) {
      /* תיעוד של מה שקרה בפועל אינו נחסם, אבל התפוגה מסומנת
         ומודפסת במסמך, כדי שלא תיעלם בשקט. */
      add(`expiry:${jm.id}`, `תאריך התפוגה של ${name} עבר. יש לוודא את האריזה.`, 5, false);
    }

    if (!text(e.chosenDoseText)) add(`dose:${jm.id}`, `חסר מינון שנבחר עבור ${name}.`, 5, true);

    if (!text(e.materialAmount)) {
      add(`amount:${jm.id}`, `חסרה כמות חומר בפועל עבור ${name}.`, 5, true);
    } else if (!isPositiveNumber(e.materialAmount)) {
      add(`amount:${jm.id}`, `כמות החומר של ${name} אינה מספר חיובי.`, 5, true);
    }

    if (text(e.waterAmount) && !isPositiveNumber(e.waterAmount)) {
      add(`water:${jm.id}`, `כמות המים של ${name} אינה מספר חיובי.`, 5, true);
    }

    if (!text(e.coverage)) {
      add(`coverage:${jm.id}`, `חסר היקף טיפול (שטח/תיבות/יחידות) עבור ${name}.`, 5, true);
    } else if (!isPositiveNumber(e.coverage)) {
      add(`coverage:${jm.id}`, `היקף הטיפול של ${name} אינו מספר חיובי.`, 5, true);
    }
  }

  const sigs = signatures ?? [];
  if (!sigs.some((s) => s.role === 'exterminator')) {
    add('sig:exterminator', 'חסרה חתימת המדביר.', 8, true);
  }
  if (!sigs.some((s) => s.role === 'customer')) {
    add('sig:customer', 'חסרה חתימת הלקוח.', 8, true);
  }
  if (!journal.customerAcknowledged) {
    add('acknowledged', 'הלקוח טרם אישר קבלת ההנחיות.', 8, true);
  }

  return issues;
}

export const blockingOnly = (issues) => issues.filter((i) => i.blocking);

/** ולידציה של מטען סנכרון בודד. מחזיר רשימת הודעות שגיאה. */
export function payloadErrors(entity, payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return ['גוף הבקשה חייב להיות אובייקט.'];
  }

  for (const field of REQUIRED_FIELDS[entity] ?? []) {
    if (!text(payload[field]) && payload[field] !== 0) {
      errors.push(`שדה חובה חסר: ${field}`);
    }
  }

  if (entity === 'journals') {
    const status = text(payload.status);
    if (!JOURNAL_STATUSES.includes(status)) errors.push('סטטוס יומן לא חוקי.');
    if (!isValidDate(payload.startedAt)) errors.push('תאריך ביצוע העבודה אינו תקין.');
    // טיוטה אף פעם אינה חסומה; רק יומן שהושלם נדרש למלא הכול.
    if (status === 'completed') {
      if (!payload.customerId) errors.push('יומן שהושלם חייב להיות משויך ללקוח.');
      if (!text(payload.licenseNumber)) errors.push('יומן שהושלם חייב לכלול מספר רישיון.');
      if (!payload.customerAcknowledged) {
        errors.push('יומן שהושלם חייב לכלול אישור לקוח על קבלת ההנחיות.');
      }
      if (payload.noProductUsed && !text(payload.noProductReason)) {
        errors.push('יומן ללא תכשיר חייב לכלול תיעוד מדוע לא נעשה שימוש בתכשיר.');
      }
    }
  }

  if (entity === 'journal_materials' && payload.execution) {
    for (const field of EXECUTION_FIELDS) {
      const value = payload.execution[field];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        errors.push(`נתון ביצוע לא חוקי: ${field}`);
      }
    }
  }

  return errors;
}

/**
 * סירוב מחיקה, עם הנימוק שיוצג למשתמש. null = מותר למחוק.
 *
 * יומן שהושלם לעולם לא נמחק – רק מארכב או מבוטל בתיעוד.
 * צילום היומן הוא המסמך שנמסר ללקוח, ואינו נמחק בכלל.
 */
export function deletionRefusal(entity, current) {
  if (entity === 'journal_snapshots') {
    return 'צילום יומן אינו נמחק: זה המסמך שנמסר ללקוח.';
  }
  if (entity === 'journals' && current && ['completed', 'sent'].includes(current.status)) {
    return 'יומן שהושלם אינו נמחק. יש לארכב אותו או לבטלו עם סיבה מתועדת.';
  }
  return null;
}
