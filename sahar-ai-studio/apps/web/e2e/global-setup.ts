import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import { E2E_REDIS_URL, FIXTURE_DIR } from './env';

/**
 * Fresh state for every run: migrate + truncate the test DB, flush the e2e Redis database,
 * generate media fixtures, and start a real worker against the same test services.
 * Returns the teardown that stops the worker.
 */
export default async function globalSetup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
  const testDatabaseUrl = process.env.TEST_DATABASE_URL!;
  if (testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  }

  execFileSync('pnpm', ['--filter', '@sahar/db', 'exec', 'prisma', 'migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });

  const { PrismaClient } = await import('@sahar/db');
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  // Cascades from User remove sessions, projects, characters, assets, jobs, etc.
  await db.$executeRawUnsafe('TRUNCATE TABLE "User", "WebhookEvent" RESTART IDENTITY CASCADE');
  await db.$disconnect();

  const redis = new Redis(E2E_REDIS_URL);
  await redis.flushdb();
  redis.disconnect();

  const { ensureFixtures } = await import(path.join(root, 'scripts/fixtures.mjs'));
  ensureFixtures(FIXTURE_DIR);

  const worker = spawn('pnpm', ['--filter', '@sahar/worker', 'exec', 'tsx', 'src/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: E2E_REDIS_URL,
      LOG_LEVEL: 'warn',
      TMPDIR: tmpdir(),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  });

  // Wait for the worker's heartbeat so tests never race its startup.
  const probe = new Redis(E2E_REDIS_URL);
  const deadline = Date.now() + 30_000;
  while (!(await probe.get('sahar:worker:heartbeat'))) {
    if (Date.now() > deadline) throw new Error('worker did not start');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  probe.disconnect();

  return async () => {
    if (worker.pid) process.kill(-worker.pid, 'SIGTERM');
  };
}
