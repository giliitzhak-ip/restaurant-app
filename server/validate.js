/**
 * ולידציה בצד השרת. משכפלת במכוון את הכללים של src/lib/validation.ts
 * כדי שלא ניתן יהיה לעקוף אותם מצד הלקוח.
 */

const REQUIRED = {
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
export const EXECUTION_FIELDS = ['batchNumber', 'packageExpiry', 'chosenDoseText', 'materialAmount', 'coverage'];

export function validatePayload(entity, payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return ['גוף הבקשה חייב להיות אובייקט.'];
  }

  for (const field of REQUIRED[entity] ?? []) {
    const value = payload[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`שדה חובה חסר: ${field}`);
    }
  }

  if (entity === 'journals') {
    const status = String(payload.status ?? '');
    if (!['draft', 'completed', 'sent', 'needs_completion', 'cancelled'].includes(status)) {
      errors.push('סטטוס יומן לא חוקי.');
    }
    // טיוטה אף פעם אינה חסומה; רק יומן שהושלם נדרש למלא הכול.
    if (status === 'completed') {
      if (!payload.customerId) errors.push('יומן שהושלם חייב להיות משויך ללקוח.');
      if (!String(payload.licenseNumber ?? '').trim()) errors.push('יומן שהושלם חייב לכלול מספר רישיון.');
      if (!payload.customerAcknowledged) errors.push('יומן שהושלם חייב לכלול אישור לקוח על קבלת ההנחיות.');
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

/** נוחות לקוד קיים: האם המחיקה מותרת. */
export function isDeletionAllowed(entity, current) {
  return deletionRefusal(entity, current) === null;
}

