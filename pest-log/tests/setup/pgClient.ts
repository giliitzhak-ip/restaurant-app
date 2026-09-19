import pg from 'pg';

/** עוזרי חיבור לבדיקות מול Postgres המקומי. */

export function connectionString(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL לא הוגדר — ראו tests/setup/pg.globalSetup.ts');
  return url;
}

/** חיבור כ-superuser (עוקף RLS) — לשימוש בהכנת נתונים בלבד. */
export async function adminClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: connectionString() });
  await client.connect();
  return client;
}

/**
 * חיבור שמדמה משתמש מחובר דרך Supabase:
 * תפקיד `authenticated` + claim של sub, בדיוק כמו PostgREST.
 * כך ה-RLS נבדק באמת ולא דרך superuser.
 */
export async function userClient(userId: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: connectionString() });
  await client.connect();
  await client.query('set role authenticated');
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await client.query(`select set_config('request.jwt.claim.role', 'authenticated', false)`);
  return client;
}

/** חיבור בתפקיד service_role — כמו שירות השרת. */
export async function serviceClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: connectionString() });
  await client.connect();
  await client.query('set role service_role');
  return client;
}

/** מזהי הנתונים שנטענים ב-seed. */
export const SEED = {
  orgA: '00000000-0000-4000-8000-000000000001',
  orgB: '00000000-0000-4000-8000-000000000002',
  userAExterminator: '00000000-0000-4000-9000-00000000000a',
  userAManager: '00000000-0000-4000-9000-00000000000b',
  userBOwner: '00000000-0000-4000-9000-00000000000c',
  clientA: '00000000-0000-4000-c000-000000000001',
  productA: '00000000-0000-4000-e000-000000000001',
} as const;
