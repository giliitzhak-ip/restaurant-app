#!/usr/bin/env node
/**
 * מפעיל Postgres מקומי לבדיקות (integration + RLS) בלי Docker ובלי Supabase.
 * שימוש:  node scripts/local-db.mjs start | stop | status | reset
 *
 * למה בכלל: בדיקות ה-RLS וההשלמה האטומית חייבות Postgres אמיתי. סביבת
 * הפיתוח כאן כוללת Postgres 16, ולכן הבדיקות רצות מולו ולא מול מוק.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PG_BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin';
const PGDATA = process.env.PGDATA_DIR ?? '/var/lib/postgresql/yomen-pgdata';
const PORT = process.env.PGPORT ?? '54329';
const PG_USER = process.env.PG_SYSTEM_USER ?? 'postgres';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? `postgres://postgres@127.0.0.1:${PORT}/postgres`;

function asPostgres(command) {
  // הרצה כמשתמש לא-root: Postgres מסרב לרוץ כ-root.
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (!isRoot) return spawnSync('bash', ['-lc', command], { encoding: 'utf8' });
  return spawnSync('su', [PG_USER, '-s', '/bin/bash', '-c', command], { encoding: 'utf8' });
}

export function status() {
  const result = asPostgres(`${PG_BIN}/pg_isready -h 127.0.0.1 -p ${PORT}`);
  return result.status === 0;
}

export function start() {
  if (status()) return TEST_DATABASE_URL;

  if (!existsSync(PGDATA)) {
    execFileSync('mkdir', ['-p', PGDATA]);
    try {
      execFileSync('chown', ['-R', `${PG_USER}:${PG_USER}`, PGDATA]);
      execFileSync('chmod', ['700', PGDATA]);
    } catch {
      // בסביבה ללא root ההרשאות כבר תקינות.
    }
    const init = asPostgres(`${PG_BIN}/initdb -D ${PGDATA} -U postgres --auth=trust -E UTF8`);
    if (init.status !== 0) throw new Error(`initdb נכשל: ${init.stderr}`);
  }

  const started = asPostgres(
    `${PG_BIN}/pg_ctl -D ${PGDATA} -o '-p ${PORT} -k /var/run/postgresql -h 127.0.0.1' -l ${PGDATA}/pg.log start -w -t 30`,
  );
  if (!status() && started.status !== 0) {
    throw new Error(`הפעלת Postgres נכשלה: ${started.stderr}\n${started.stdout}`);
  }
  return TEST_DATABASE_URL;
}

export function stop() {
  if (!status()) return;
  asPostgres(`${PG_BIN}/pg_ctl -D ${PGDATA} stop -m fast -w -t 30`);
}

export function reset() {
  stop();
  execFileSync('rm', ['-rf', PGDATA]);
  start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? 'start';
  switch (command) {
    case 'start':
      console.info(start());
      break;
    case 'stop':
      stop();
      console.info('Postgres נעצר');
      break;
    case 'status':
      console.info(status() ? 'פועל' : 'לא פועל');
      break;
    case 'reset':
      console.info(reset() ?? TEST_DATABASE_URL);
      break;
    default:
      console.error(`פקודה לא מוכרת: ${command}`);
      process.exit(1);
  }
}
