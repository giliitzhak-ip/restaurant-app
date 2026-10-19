import { defineConfig, devices } from "@playwright/test";

// E2E against a running app + media worker (see README → "End-to-end tests").
// WebKit is not available in every environment, so the iPhone profile runs on
// Chromium with iPhone viewport, touch and user agent.
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 14 Pro"], defaultBrowserType: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
