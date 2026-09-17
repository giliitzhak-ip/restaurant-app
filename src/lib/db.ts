import pg from 'pg';

/**
 * Database access (spec §22, §23, §45).
 *
 * Two access modes, and the difference is the whole security model:
 *
 *   withUser(userId)  — runs inside a transaction as the `authenticated`
 *                       role with request.jwt.claims set. This is exactly
 *                       what PostgREST does on Supabase, so RLS is genuinely
 *                       enforced by the database. Everything reachable from a
 *                       browser request uses this.
 *
 *   withSystem()      — runs as `service_role` (BYPASSRLS) for trusted
 *                       server-only work: dispatch, matching, payment
 *                       capture. Never reachable from a browser; it does its
 *                       own authorization before it is called.
 *
 * The application NEVER connects as a superuser or as the table owner, both
 * of which would silently bypass RLS and make the policies decorative.
 */

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://getservice_app:getservice_app@127.0.0.1:5432/getservice';

declare global {
  // Reused across hot reloads in development so we do not leak pools.
  var __getServicePool: pg.Pool | undefined;
}

function createPool(): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // A stuck query must not hold a request open indefinitely.
    statement_timeout: 15_000,
  });
  pool.on('error', (error) => {
    // An idle client erroring must not crash the server.
    console.error('[db] idle client error', error.message);
  });
  return pool;
}

export function getPool(): pg.Pool {
  if (!globalThis.__getServicePool) {
    globalThis.__getServicePool = createPool();
  }
  return globalThis.__getServicePool;
}

export type SqlParam = string | number | boolean | null | Date | readonly string[] | object;

/** A database handle scoped to one transaction. */
export interface DbSession {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<pg.QueryResult<T>>;
  /** Convenience: first row or null. */
  one<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<T | null>;
  /** All rows. */
  many<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<T[]>;
}

export type Actor = 'customer' | 'provider' | 'admin' | 'system';

function wrap(client: pg.PoolClient): DbSession {
  return {
    query: (sql, params) => client.query(sql, params as unknown[]),
    async one(sql, params) {
      const result = await client.query(sql, params as unknown[]);
      return (result.rows[0] as never) ?? null;
    },
    async many(sql, params) {
      const result = await client.query(sql, params as unknown[]);
      return result.rows as never[];
    },
  };
}

export interface UserContextOptions {
  /** Drives the server-side role check inside the transition trigger. */
  readonly actorRole?: Actor;
  /** Recorded on the audit row for this status change. */
  readonly transitionReason?: string;
}

/**
 * Run `fn` as a specific signed-in user, with RLS enforced.
 *
 * Everything happens in one transaction, which is required: the JWT claim is
 * set with `set_local`, so it is scoped to the transaction and cannot leak to
 * the next request that borrows this pooled connection.
 */
export async function withUser<T>(
  userId: string,
  fn: (db: DbSession) => Promise<T>,
  options: UserContextOptions = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    if (options.actorRole) {
      await client.query('select set_config($1, $2, true)', ['app.actor_role', options.actorRole]);
    }
    if (options.transitionReason) {
      await client.query('select set_config($1, $2, true)', [
        'app.transition_reason',
        options.transitionReason,
      ]);
    }

    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` as trusted server code, bypassing RLS.
 *
 * Only for operations that have already performed their own authorization:
 * dispatch, matching, payment capture, scheduled maintenance. Never call this
 * with a user-supplied identifier as the authorization decision.
 */
export async function withSystem<T>(
  fn: (db: DbSession) => Promise<T>,
  options: { actorRole?: Actor; transitionReason?: string; actingUserId?: string } = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role service_role');
    // Even system work identifies itself, so the audit trail is never blank.
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: options.actingUserId ?? null, role: 'service_role' }),
    ]);
    await client.query('select set_config($1, $2, true)', [
      'app.actor_role',
      options.actorRole ?? 'system',
    ]);
    if (options.transitionReason) {
      await client.query('select set_config($1, $2, true)', [
        'app.transition_reason',
        options.transitionReason,
      ]);
    }

    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Anonymous access (login, public catalog). RLS still applies. */
export async function withAnon<T>(fn: (db: DbSession) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Known Postgres/domain error codes surfaced by our functions. */
export const DB_ERROR = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
  INSUFFICIENT_PRIVILEGE: '42501',
  NOT_FOUND: 'P0002',
  RAISED: '55000',
} as const;

export function isPgError(error: unknown): error is pg.DatabaseError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Extract the domain error name our SQL functions raise, e.g.
 * 'JOB_ALREADY_ASSIGNED' from 'JOB_ALREADY_ASSIGNED'.
 */
export function pgErrorName(error: unknown): string | null {
  if (!isPgError(error) || typeof error.message !== 'string') return null;
  const match = /^([A-Z_]+)(?::|$)/.exec(error.message);
  return match?.[1] ?? null;
}
