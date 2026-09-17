import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { allowedTransitions, type JobStatus } from '@/domains/jobs/state-machine';

/**
 * Integration-test fixtures.
 *
 * Rows are created with the OWNER connection (which bypasses RLS) so that
 * building a fixture never depends on the policies under test. The code being
 * tested then connects through the normal restricted app path.
 */
const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

let admin: pg.Pool | null = null;

export function adminPool(): pg.Pool {
  admin ??= new pg.Pool({ connectionString: adminUrl, max: 5 });
  return admin;
}

export async function closeAdminPool(): Promise<void> {
  await admin?.end();
  admin = null;
}

export interface TestCustomer {
  id: string;
  email: string;
}

export interface TestProvider {
  id: string;
  email: string;
}

/** Everything created through these helpers is tagged so cleanup is precise. */
const TEST_TAG = 'itest';

export async function createCustomer(name = 'לקוח בדיקה'): Promise<TestCustomer> {
  const id = randomUUID();
  const email = `${TEST_TAG}-cust-${id.slice(0, 8)}@test.local`;
  const db = adminPool();
  await db.query('insert into auth.users (id, email) values ($1,$2)', [id, email]);
  await db.query(
    `insert into profiles (id, role, full_name, email, is_demo) values ($1,'customer',$2,$3,true)`,
    [id, name, email],
  );
  await db.query('insert into customer_profiles (id) values ($1)', [id]);
  return { id, email };
}

export interface ProviderOptions {
  name?: string;
  categorySlug?: string;
  serviceSlug?: string;
  lat?: number;
  lon?: number;
  headingDeg?: number | null;
  speedKmh?: number | null;
  destination?: { lat: number; lon: number } | null;
  state?: 'ONLINE' | 'OFFLINE' | 'BUSY';
  verification?: 'VERIFIED' | 'PENDING' | 'REJECTED' | 'SUSPENDED';
  priceIls?: number;
  ratingAvg?: number;
  ratingCount?: number;
  completedJobs?: number;
  cancelledJobs?: number;
  yearsExperience?: number;
  locationAgeSeconds?: number;
  accuracyM?: number;
  maxRadiusKm?: number;
}

export async function createProvider(options: ProviderOptions = {}): Promise<TestProvider> {
  const {
    name = 'מקצוען בדיקה',
    categorySlug = 'plumbing',
    serviceSlug = 'sink_leak',
    lat = 32.0742,
    lon = 34.7749,
    headingDeg = null,
    speedKmh = 30,
    destination = null,
    state = 'ONLINE',
    verification = 'VERIFIED',
    priceIls = 290,
    ratingAvg = 4.7,
    ratingCount = 100,
    completedJobs = 150,
    cancelledJobs = 5,
    yearsExperience = 8,
    locationAgeSeconds = 10,
    accuracyM = 12,
    maxRadiusKm = 30,
  } = options;

  const id = randomUUID();
  const email = `${TEST_TAG}-prov-${id.slice(0, 8)}@test.local`;
  const db = adminPool();

  await db.query('insert into auth.users (id, email) values ($1,$2)', [id, email]);
  await db.query(
    `insert into profiles (id, role, full_name, email, is_demo) values ($1,'provider',$2,$3,true)`,
    [id, name, email],
  );
  await db.query(
    `insert into provider_profiles
       (id, verification, state, rating_avg, rating_count, completed_jobs,
        cancelled_jobs, offers_received, offers_accepted, avg_response_seconds,
        years_experience, max_radius_km, is_demo)
     values ($1,$2::verification_status,$3::provider_state,$4,$5,$6,$7,$8,$9,20,$10,$11,true)`,
    [
      id, verification, state, ratingAvg, ratingCount, completedJobs, cancelledJobs,
      completedJobs + cancelledJobs + 10, completedJobs, yearsExperience, maxRadiusKm,
    ],
  );

  const { rows: cat } = await db.query(
    'select id from categories where slug = $1',
    [categorySlug],
  );
  const categoryId = cat[0]?.id;
  if (!categoryId) throw new Error(`Unknown category ${categorySlug}`);

  const skill = categorySlug === 'air_conditioning' ? 'hvac' : categorySlug;
  await db.query(
    `insert into provider_categories (provider_id, category_id, skills, is_primary)
     values ($1,$2,$3,true)`,
    [id, categoryId, [skill]],
  );

  const { rows: svc } = await db.query(
    'select id from services where category_id = $1 and slug = $2',
    [categoryId, serviceSlug],
  );
  if (svc[0]?.id) {
    await db.query(
      `insert into provider_services (provider_id, service_id, price_ils, is_active)
       values ($1,$2,$3,true)`,
      [id, svc[0].id, priceIls],
    );
  }

  if (state !== 'OFFLINE') {
    await db.query(
      `insert into provider_locations
         (provider_id, location, heading_deg, speed_kmh, accuracy_m, destination, recorded_at)
       values ($1, st_point($3,$2)::geography, $4, $5, $6,
               case when $7::double precision is null then null
                    else st_point($8,$7)::geography end,
               now() - make_interval(secs => $9))`,
      [
        id, lat, lon, headingDeg, speedKmh, accuracyM,
        destination?.lat ?? null, destination?.lon ?? null, locationAgeSeconds,
      ],
    );
  }

  await db.query(
    `insert into service_areas (provider_id, label, center, radius_km, is_active)
     values ($1,'test area', st_point($3,$2)::geography, 40, true)`,
    [id, lat, lon],
  );

  return { id, email };
}

export interface CreateJobOptions {
  customerId: string;
  description?: string;
  categorySlug?: string;
  serviceSlug?: string;
  lat?: number;
  lon?: number;
  status?: string;
  urgency?: string;
}

export async function createJob(options: CreateJobOptions): Promise<string> {
  const {
    customerId,
    description = 'יש לי נזילה מתחת לכיור',
    categorySlug = 'plumbing',
    serviceSlug = 'sink_leak',
    lat = 32.0742,
    lon = 34.7749,
    status = 'SEARCHING',
    urgency = 'high',
  } = options;

  const db = adminPool();
  const { rows } = await db.query(
    `insert into jobs
       (customer_id, raw_description, category_id, service_id, urgency, status,
        location, location_accuracy_m, is_demo)
     select $1, $2, c.id, s.id, $5::urgency_level, $6::job_status,
            st_point($4,$3)::geography, 12, true
       from categories c
       left join services s on s.category_id = c.id and s.slug = $8
      where c.slug = $7
     returning id`,
    [customerId, description, lat, lon, urgency, status, categorySlug, serviceSlug],
  );

  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to create test job');
  return id;
}

export async function createAdmin(): Promise<TestCustomer> {
  const id = randomUUID();
  const email = `${TEST_TAG}-admin-${id.slice(0, 8)}@test.local`;
  const db = adminPool();
  await db.query('insert into auth.users (id, email) values ($1,$2)', [id, email]);
  await db.query(
    `insert into profiles (id, role, full_name, email, is_demo) values ($1,'admin','מנהל בדיקה',$2,true)`,
    [id, email],
  );
  return { id, email };
}

export async function jobStatus(jobId: string): Promise<string> {
  const { rows } = await adminPool().query('select status::text as status from jobs where id = $1', [
    jobId,
  ]);
  return rows[0]?.status ?? 'MISSING';
}

/**
 * Remove every row this suite created.
 *
 * Deletion order matters: several production FKs are ON DELETE RESTRICT on
 * purpose (a job must not silently vanish because a profile was removed), so
 * the dependent rows have to go first. That the order is needed at all is
 * itself a check that those constraints are real.
 */
export async function cleanupTestData(): Promise<void> {
  const db = adminPool();
  const { rows } = await db.query<{ id: string }>(
    `select id from auth.users where email like $1`,
    [`${TEST_TAG}-%@test.local`],
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;

  const { rows: jobRows } = await db.query<{ id: string }>(
    `select id from jobs where customer_id = any($1::uuid[])`,
    [ids],
  );
  const jobIds = jobRows.map((r) => r.id);

  if (jobIds.length > 0) {
    await db.query(
      `delete from payment_transactions
        where payment_id in (select id from payments where job_id = any($1::uuid[]))`,
      [jobIds],
    );
  }
  await db.query(
    `delete from payments where customer_id = any($1::uuid[]) or provider_id = any($1::uuid[])`,
    [ids],
  );
  await db.query(
    `delete from job_assignments
      where provider_id = any($1::uuid[])
         or job_id = any($2::uuid[])`,
    [ids, jobIds],
  );
  await db.query(
    `delete from job_offers
      where provider_id = any($1::uuid[])
         or job_id = any($2::uuid[])`,
    [ids, jobIds],
  );
  await db.query(
    `update provider_locations set destination_job_id = null
      where destination_job_id = any($1::uuid[])`,
    [jobIds],
  );
  await db.query(`delete from jobs where customer_id = any($1::uuid[])`, [ids]);
  // admin_actions.admin_id is ON DELETE RESTRICT, so the audit log refuses to
  // let an admin be deleted out from under it. Correct for production — in
  // tests the trail goes with the fixture.
  await db.query(
    `delete from admin_actions where admin_id = any($1::uuid[]) or target_id = any($1::uuid[])`,
    [ids],
  );
  await db.query(
    `delete from provider_admin_notes where provider_id = any($1::uuid[]) or author_id = any($1::uuid[])`,
    [ids],
  );
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [ids]);
}

/**
 * Walk a job to a target status through LEGAL transitions only.
 *
 * Deliberately does not UPDATE straight to the target: the database trigger
 * rejects an illegal jump even for the table owner, which is exactly the
 * guarantee we want, so fixtures have to respect the state machine too.
 */
export async function advanceJobTo(jobId: string, target: JobStatus): Promise<void> {
  const db = adminPool();
  const { rows } = await db.query<{ status: JobStatus }>(
    'select status::text as status from jobs where id = $1',
    [jobId],
  );
  const current = rows[0]?.status;
  if (!current) throw new Error(`Job ${jobId} not found`);

  const path = shortestPath(current, target);
  if (!path) throw new Error(`No legal path from ${current} to ${target}`);

  const client = await db.connect();
  try {
    for (const next of path) {
      await client.query('begin');
      // Admin may drive every transition, so fixtures need no per-step actor.
      await client.query(`select set_config('app.actor_role','admin',true)`);
      await client.query(`select set_config('app.transition_reason','test fixture',true)`);
      await client.query('update jobs set status = $2::job_status where id = $1', [jobId, next]);
      await client.query('commit');
    }
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Breadth-first search over the transition map. */
function shortestPath(from: JobStatus, to: JobStatus): JobStatus[] | null {
  if (from === to) return [];
  const queue: { status: JobStatus; path: JobStatus[] }[] = [{ status: from, path: [] }];
  const seen = new Set<JobStatus>([from]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const next of allowedTransitions(current.status, 'admin')) {
      if (seen.has(next)) continue;
      const path = [...current.path, next];
      if (next === to) return path;
      seen.add(next);
      queue.push({ status: next, path });
    }
  }
  return null;
}

/**
 * A provider as REGISTRATION leaves them: an account and a profile, but no
 * declared trade, no prices and no service area.
 *
 * Deliberately distinct from createProvider(), which produces a fully
 * configured provider. This is the state a real signup actually reaches.
 */
export async function createBareProvider(
  options: { name?: string; verification?: 'PENDING' | 'VERIFIED' } = {},
): Promise<TestProvider> {
  const { name = 'מקצוען חדש', verification = 'PENDING' } = options;
  const id = randomUUID();
  const email = `${TEST_TAG}-bare-${id.slice(0, 8)}@test.local`;
  const db = adminPool();

  await db.query('insert into auth.users (id, email) values ($1,$2)', [id, email]);
  await db.query(
    `insert into profiles (id, role, full_name, email, is_demo) values ($1,'provider',$2,$3,true)`,
    [id, name, email],
  );
  await db.query(
    `insert into provider_profiles (id, verification, state, is_demo)
     values ($1, $2::verification_status, 'OFFLINE', true)`,
    [id, verification],
  );
  return { id, email };
}
