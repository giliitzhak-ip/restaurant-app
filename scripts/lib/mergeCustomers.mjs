/**
 * תכנון מיזוג של שני לקוחות שהתגלו ככפילות.
 *
 * כללי הבטיחות:
 *   • שום רשומה אינה נמחקת. הלקוח המיותר מסומן כמאורכב, והערה
 *     מתועדת בו, כך שתמיד אפשר לחזור אחורה.
 *   • כל ההפניות עוברות ללקוח שנשמר: יומנים, אתרים, משימות,
 *     תיבות האכלה, תבניות ותחנות מסלול.
 *   • מידע ייחודי אינו נזרק: שדה ריק אצל הלקוח שנשמר מתמלא
 *     מהלקוח שמוזג, ושדה שיש בו ערך אחר נשמר בהערה.
 *   • מיזוג בין עסקים שונים אינו אפשרי.
 *
 * הקובץ מתכנן בלבד. ההחלה נעשית בסקריפט, ורק עם --apply.
 */

/** שדות שאפשר להשלים מהלקוח שמוזג, אם הם ריקים אצל הנשמר. */
const FILLABLE = ['contactName', 'phone', 'phoneAlt', 'email', 'city', 'notes', 'address'];

/** ישות → השדה שמצביע על הלקוח. */
export const CUSTOMER_REFERENCES = {
  journals: 'customerId',
  customer_sites: 'customerId',
  tasks: 'customerId',
  bait_stations: 'customerId',
  customer_templates: 'customerId',
  route_stops: 'customerId',
};

/**
 * docs: [{ entity, entityId, payload, orgId }]
 * מחזיר תוכנית: מה ישתנה, ומה הוחלט לא לגעת בו.
 */
export function planCustomerMerge(docs, keepId, mergeId) {
  if (keepId === mergeId) {
    return { ok: false, errors: ['אותו מזהה הוזן פעמיים.'] };
  }

  const customers = docs.filter((d) => d.entity === 'customers');
  const keep = customers.find((d) => d.entityId === keepId);
  const merge = customers.find((d) => d.entityId === mergeId);

  const errors = [];
  if (!keep) errors.push(`הלקוח שיישמר לא נמצא: ${keepId}`);
  if (!merge) errors.push(`הלקוח שימוזג לא נמצא: ${mergeId}`);
  if (errors.length) return { ok: false, errors };
  if (keep.orgId !== merge.orgId) {
    return { ok: false, errors: ['שני הלקוחות שייכים לעסקים שונים. מיזוג אינו אפשרי.'] };
  }

  /* השלמת שדות ריקים, ותיעוד הבדלים שאינם ניתנים לאיחוד. */
  const keepPayload = { ...keep.payload };
  const filled = [];
  const conflicts = [];
  for (const field of FILLABLE) {
    const a = String(keepPayload[field] ?? '').trim();
    const b = String(merge.payload[field] ?? '').trim();
    if (!b || a === b) continue;
    if (!a) {
      keepPayload[field] = merge.payload[field];
      filled.push(field);
    } else {
      conflicts.push({ field, keep: a, merged: b });
    }
  }
  if (conflicts.length > 0) {
    const text = conflicts.map((c) => `${c.field}: ${c.merged}`).join(' · ');
    keepPayload.notes = [String(keepPayload.notes ?? '').trim(), `מהרשומה שאוחדה – ${text}`]
      .filter(Boolean).join('\n');
  }

  const mergedPayload = {
    ...merge.payload,
    archived: true,
    notes: [
      String(merge.payload.notes ?? '').trim(),
      `אוחד אל לקוח ${keepPayload.customerNumber ?? keepId} (${keepPayload.name ?? ''}).`,
    ].filter(Boolean).join('\n'),
  };

  const moves = [];
  for (const [entity, field] of Object.entries(CUSTOMER_REFERENCES)) {
    for (const doc of docs) {
      if (doc.entity !== entity) continue;
      if (doc.payload?.[field] !== mergeId) continue;
      moves.push({
        entity,
        entityId: doc.entityId,
        field,
        from: mergeId,
        to: keepId,
        payload: { ...doc.payload, [field]: keepId },
      });
    }
  }

  return {
    ok: true,
    orgId: keep.orgId,
    keep: { entityId: keepId, payload: keepPayload, name: keepPayload.name },
    merged: { entityId: mergeId, payload: mergedPayload, name: merge.payload.name },
    filled,
    conflicts,
    moves,
  };
}
