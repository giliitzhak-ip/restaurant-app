import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite.
 *
 * Runs against a production build on the in-memory repository, which is seeded
 * from the same catalogue data as production — so the tests exercise real
 * prices, real stock levels and the real checkout maths without a database.
 *
 * `APP_ENV=test` is what lets that happen: `next start` always reports
 * NODE_ENV=production, and the production contract (DATABASE_URL, remote
 * storage, a real AUTH_SECRET) would otherwise refuse to boot. The suite runs
 * against a build rather than `next dev` because the dev server's HMR socket
 * is part of its hydration path, which makes it a poor stand-in for what a
 * customer loads.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },

  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
      testMatch: /(shop|a11y)/,
    },
    {
      name: "mobile-375",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: false },
      testMatch: /(shop|a11y)/,
    },
    {
      name: "mobile-430",
      use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 }, isMobile: false },
      testMatch: /(shop|a11y)/,
    },
  ],

  webServer: {
    command: `npx next build && npx next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      APP_ENV: "test",
      AUTH_SECRET: "playwright-suite-secret-not-used-in-production-0001",
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
