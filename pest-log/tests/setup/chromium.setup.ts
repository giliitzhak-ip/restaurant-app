import { existsSync } from 'node:fs';

/**
 * מאתר Chromium מותקן, אם לא הוגדר במשתני הסביבה.
 *
 * בסביבות שבהן Playwright לא הוריד דפדפן בעצמו (קונטיינרים עם Chromium
 * מותקן מראש) הבדיקות היו נכשלות בלי המשתנה. כאן הוא מושלם אוטומטית,
 * כדי שהרצת הבדיקות לא תדרוש זכירה של משתנה סביבה.
 */

const CANDIDATES = [
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

export function resolveChromiumPath(): string | undefined {
  const configured = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  if (configured) return configured;
  return CANDIDATES.find((candidate) => existsSync(candidate));
}

const resolved = resolveChromiumPath();
if (resolved && !process.env.CHROMIUM_EXECUTABLE_PATH) {
  process.env.CHROMIUM_EXECUTABLE_PATH = resolved;
}
