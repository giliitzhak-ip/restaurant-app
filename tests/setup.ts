/**
 * Test bootstrap: load .env.local so integration and security suites talk to
 * the real local Postgres exactly as the app does — as the RESTRICTED role,
 * so RLS is genuinely in force during tests.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');

try {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // Falls back to whatever is already in the environment (e.g. CI).
}

process.env.MAP_PROVIDER ??= 'estimate';
process.env.PAYMENT_PROVIDER ??= 'mock';

/**
 * Integration and security suites run against a DEDICATED test database.
 *
 * They share a Postgres instance with development, where the demo seed places
 * providers around Tel Aviv — inside the radius the dispatch tests search. So
 * without this redirection a test's result depended on whether `db:seed` had
 * been run, which is not a property tests may have.
 *
 * Create it with: npm run test:db
 */
function swapDatabase(url: string | undefined, database: string): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

const testDbName = process.env.TEST_DB_NAME ?? 'getservice_test';
process.env.DATABASE_URL = swapDatabase(process.env.DATABASE_URL, testDbName);
process.env.DATABASE_ADMIN_URL = swapDatabase(process.env.DATABASE_ADMIN_URL, testDbName);
