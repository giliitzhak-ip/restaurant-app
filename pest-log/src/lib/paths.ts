/**
 * קריאה וכתיבה לנתיב בתוך אובייקט התוכן, בלי מוטציה.
 * הנתיב הוא אותו נתיב שמופיע בשגיאות Zod, למשל "applications.0.dosage".
 */

export type Mutable = Record<string, unknown>;

export function getAtPath(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === 'object') return (acc as Mutable)[key];
    return undefined;
  }, source);
}

/** מחזיר עותק חדש עם הערך שהוצב בנתיב. יוצר אובייקטים/מערכים חסרים בדרך. */
export function setAtPath<T extends Mutable>(source: T, path: string, value: unknown): T {
  const segments = path.split('.');
  const clone = (Array.isArray(source) ? [...(source as unknown[])] : { ...source }) as T;

  let cursor: unknown = clone;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    const nextKey = segments[i + 1]!;
    const container = cursor as Mutable | unknown[];
    const existing = Array.isArray(container) ? container[Number(key)] : (container as Mutable)[key];

    let next: unknown;
    if (Array.isArray(existing)) next = [...existing];
    else if (existing && typeof existing === 'object') next = { ...(existing as Mutable) };
    else next = /^\d+$/.test(nextKey) ? [] : {};

    if (Array.isArray(container)) container[Number(key)] = next;
    else (container as Mutable)[key] = next;
    cursor = next;
  }

  const lastKey = segments[segments.length - 1]!;
  const container = cursor as Mutable | unknown[];
  if (Array.isArray(container)) container[Number(lastKey)] = value;
  else (container as Mutable)[lastKey] = value;

  return clone;
}

/** מסיר מפתח מנתיב (למשל מחיקת פריט אופציונלי). */
export function deleteAtPath<T extends Mutable>(source: T, path: string): T {
  const segments = path.split('.');
  const parentPath = segments.slice(0, -1).join('.');
  const lastKey = segments[segments.length - 1]!;
  const parent = parentPath ? getAtPath(source, parentPath) : source;
  if (!parent || typeof parent !== 'object') return source;

  if (Array.isArray(parent)) {
    const next = parent.filter((_, index) => index !== Number(lastKey));
    return parentPath ? setAtPath(source, parentPath, next) : (next as unknown as T);
  }
  const next = { ...(parent as Mutable) };
  delete next[lastKey];
  return parentPath ? setAtPath(source, parentPath, next) : (next as unknown as T);
}

/** קורא מערך מנתיב, ומחזיר מערך ריק אם אין. */
export function getArray(source: unknown, path: string): unknown[] {
  const value = getAtPath(source, path);
  return Array.isArray(value) ? value : [];
}

/** קורא מחרוזת מנתיב לצורך הצגה בשדה קלט. */
export function getString(source: unknown, path: string): string {
  const value = getAtPath(source, path);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function getBoolean(source: unknown, path: string): boolean {
  return getAtPath(source, path) === true;
}
