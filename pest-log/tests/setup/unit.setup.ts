/**
 * הכנה לבדיקות היחידה.
 * jsdom אינו מספק crypto.subtle ואינו מספק structuredClone בכל גרסה —
 * כאן מחברים את המימושים האמיתיים של Node, ולא מוקים.
 */
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

if (typeof globalThis.structuredClone !== 'function') {
  // מימוש מינימלי לצורכי הבדיקות — JSON בלבד, ואין בקוד Blob/Map בתוכן.
  globalThis.structuredClone = ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone;
}
