import { defineConfig, devices } from '@playwright/test';

/**
 * E2E מול האפליקציה האמיתית בדפדפן.
 *
 * הבדיקות רצות מול build אמיתי (vite preview) עם שכבת Supabase מדומה
 * ברמת הרשת (route interception) — כך שהאשף, השמירה ל-IndexedDB, העבודה
 * ללא קליטה והחזרה לרשת נבדקים בקוד האמיתי, בלי תלות בפרויקט Supabase חי.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    // בקשות שיוצאות מ-service worker אינן נתפסות ב-page.route, ולכן ה-SW
    // חסום בבדיקות. העבודה ללא קליטה נבדקת דרך IndexedDB ומנוע הסנכרון,
    // שהם הרכיבים שאחראים על שמירת הטיוטה.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } }
      : {}),
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      // בדיקה במכשיר נייד — הדרישה כוללת התאמה לנייד.
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // preview במצב e2e, כדי שכותרות ה-CSP ומשתני הסביבה יהיו זהים ל-build.
    command: 'npm run preview:e2e -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // שימוש חוזר בשרת preview שכבר פועל. חשוב: הוא חייב להיות במצב e2e,
    // ולכן ה-command למטה הוא preview:e2e ו-test:e2e בונה לפניו.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
