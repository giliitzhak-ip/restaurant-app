import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Redis } from 'ioredis';

/** Fresh state for every run: migrate + truncate the test DB, flush the e2e Redis database. */
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
  // Cascades from User remove sessions, projects, characters, jobs, etc.
  await db.$executeRawUnsafe('TRUNCATE TABLE "User", "WebhookEvent" RESTART IDENTITY CASCADE');
  await db.$disconnect();

  const redis = new Redis(process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/15');
  await redis.flushdb();
  redis.disconnect();
}
