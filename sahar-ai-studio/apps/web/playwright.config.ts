import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const PORT = Number(process.env.E2E_PORT ?? 3100);
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL must be set for end-to-end tests');
// Isolated Redis logical database so e2e runs never share rate-limit counters with dev.
const e2eRedisUrl = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/15';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'he-IL',
    trace: 'retain-on-failure',
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
      ALLOW_REGISTRATION: 'true',
      // Every test registers from 127.0.0.1, so per-IP limits are lifted; the per-email
      // login limit stays at its production default and is asserted in auth.spec.ts.
      AUTH_LOGIN_MAX_PER_IP: '10000',
      AUTH_REGISTER_MAX_PER_IP: '10000',
      AUTH_LOGIN_MAX_PER_EMAIL: '8',
    },
  },
});
