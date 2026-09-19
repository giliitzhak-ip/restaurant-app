import { defineConfig, devices } from '@playwright/test';
import { resolveChromiumPath } from './tests/setup/chromium.setup';

// Chromium מותקן מראש בסביבות מסוימות; מאותר אוטומטית כדי שלא יידרש
// משתנה סביבה בכל הרצה.
const chromiumPath = resolveChromiumPath();

/**
 * E2E מול האפליקציה האמיתית בדפדפן.
 *
 * הבדיקות רצות מול build אמיתי (vite preview) עם שכבת Supabase מדומה
 * ברמת הרשת (route interception) — כך שהאשף, השמירה ל-IndexedDB, העבודה
 * ללא קליטה והחזרה לרשת נבדקים בקוד האמיתי, בלי תלות בפרויקט Supabase חי.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // כל בדיקה מקבלת דף ומוק משלה, ואין ביניהן מצב משותף — ולכן הרצה
  // מקבילה בטוחה ומקצרת את זמן ההרצה משמעותית.
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    // ה-service worker פעיל בבדיקות: בלעדיו הדף אינו נטען כלל ללא
    // קליטה, ולא היה אפשר לבדוק רענון במצב מנותק. קריאות ה-API אינן
    // עוברות דרך ה-SW, ולכן page.route ממשיך לתפוס אותן.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      // בדיקה במכשיר נייד: מסך בגודל טלפון עם מגע.
      //
      // isMobile של Chromium מפעיל visual viewport נפרד, ואז הקואורדינטות
      // שבהן Playwright מקליק אינן תואמות לפריסה כשהדף גלול — הקליק נופל
      // על <html> במקום על הכפתור. זו התנגשות בין הכלים ולא באג באפליקציה
      // (בדיקת elementFromPoint על הכפתור עצמו מחזירה את הכפתור).
      // לכן נשמרים גודל המסך, יחס הפיקסלים והמגע, בלי isMobile.
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: false,
      },
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
