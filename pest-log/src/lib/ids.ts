/** מזהים: UUID ומפתחות אידמפוטנטיות. */

/** UUID v4. נופל חזרה ל-getRandomValues בדפדפנים בלי randomUUID. */
export function newUuid(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();

  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  // גרסה 4, variant 10
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * מפתח אידמפוטנטיות לפעולת סנכרון.
 * נגזר מסוג הפעולה + מזהה היישות + דיסקרימינטור, כדי שניסיון חוזר של אותה
 * פעולה לא ייצור כפילות בצד השרת.
 */
export function idempotencyKey(operation: string, entityId: string, discriminator = ''): string {
  const base = `${operation}:${entityId}${discriminator ? `:${discriminator}` : ''}`;
  return base.length >= 8 ? base : `${base}:${newUuid().slice(0, 8)}`;
}

/** שם קובץ אקראי — לא נגזר מתוכן או מפרטי לקוח. */
export function randomFileName(extension: string): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const name = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const ext = extension.replace(/^\.+/, '').toLowerCase();
  return ext ? `${name}.${ext}` : name;
}
