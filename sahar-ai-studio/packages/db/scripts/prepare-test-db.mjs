// Applies all migrations to TEST_DATABASE_URL. Refuses to run against the main database.
import { spawnSync } from 'node:child_process';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set.');
  process.exit(1);
}
if (testUrl === process.env.DATABASE_URL) {
  console.error(
    'TEST_DATABASE_URL must differ from DATABASE_URL — refusing to touch the main database.',
  );
  process.exit(1);
}

const result = spawnSync('prisma', ['migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
