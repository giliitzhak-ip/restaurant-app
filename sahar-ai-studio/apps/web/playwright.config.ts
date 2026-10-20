import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { E2E_REDIS_URL } from './e2e/env';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const PORT = Number(process.env.E2E_PORT ?? 3100);
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL must be set for end-to-end tests');
const e2eRedisUrl = E2E_REDIS_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'he-IL',
    trace: 'retain-on-failure',
    // Real devices have a UTF-8 locale; without one Chromium cannot represent Hebrew
    // download filenames (it falls back to "download").
    launchOptions: { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    {
      name: 'iphone-chromium',
      // iPhone 14 viewport, touch and user agent, rendered with the installed Chromium.
      use: { ...devices['iPhone 14'], browserName: 'chromium', defaultBrowserType: 'chromium' },
      testMatch: /mobile\.spec/,
    },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: e2eRedisUrl,
      E2E_REDIS_URL: e2eRedisUrl,
      APP_URL: `http://localhost:${PORT}`,
      NEXT_DIST_DIR: '.next-e2e',
      ALLOW_REGISTRATION: 'true',
      // Every test registers from 127.0.0.1, so per-IP limits are lifted; the per-email
      // login limit stays at its production default and is asserted in auth.spec.ts.
      AUTH_LOGIN_MAX_PER_IP: '10000',
      AUTH_REGISTER_MAX_PER_IP: '10000',
      AUTH_LOGIN_MAX_PER_EMAIL: '8',
      // Small image limit so the 6 MB fixture exercises client- and server-side size checks.
      MAX_IMAGE_UPLOAD_MB: '5',
    },
  },
});
