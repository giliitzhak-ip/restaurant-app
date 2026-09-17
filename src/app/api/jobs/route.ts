import { z } from 'zod';
import { ApiError, fail, handleError, ok, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import { jobUnderstanding } from '@/domains/jobs/understanding';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({
  description: z.string().trim().min(3).max(2000),
  // Location is REQUIRED and must come from a real fix. There is no default
  // and no silent fallback: inventing a location is worse than failing
  // (spec §44 "GPS unavailable — do not invent location").
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().max(100_000).nullable().optional(),
  addressText: z.string().trim().max(300).optional(),
  addressNotes: z.string().trim().max(500).optional(),
  bookingMode: z.enum(['NOW', 'SCHEDULE', 'COMPARE']).default('NOW'),
  scheduledFor: z.iso.datetime().optional(),
  /** Set when the customer corrected our classification. */
  categorySlug: z.string().max(60).optional(),
  serviceSlug: z.string().max(60).optional(),
});

export async function POST(request: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const user = await requireUser();
    if (user.role !== 'customer') {
      throw new ApiError('FORBIDDEN', 'רק לקוחות יכולים לפתוח קריאת שירות', 403);
    }

    const limit = rateLimit(`jobs:${user.id}`, 10, 300);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'נפתחו יותר מדי קריאות. נסו בעוד כמה דקות.', 429, requestId);
    }

    const body = await parseJson(request, bodySchema);

    if (body.bookingMode === 'SCHEDULE' && !body.scheduledFor) {
      throw new ApiError('SCHEDULE_TIME_REQUIRED', 'יש לבחור מועד לתור', 422);
    }

    // Classification happens on the server. A client-supplied slug is only a
    // correction hint and is still validated against the catalog below.
    const understanding = await jobUnderstanding.understand(body.description);
    const categorySlug = body.categorySlug ?? understanding.category;
    const serviceSlug = body.serviceSlug ?? understanding.service;

    if (!categorySlug) {
      throw new ApiError(
        'UNDERSTANDING_FAILED',
        understanding.clarifyingQuestion ?? 'לא הצלחנו לזהות את סוג התקלה',
        422,
        { understanding },
      );
    }

    const resolved = await withSystem((db) =>
      db.one<{
        category_id: string;
        service_id: string | null;
        supports_now: boolean;
        supports_schedule: boolean;
        supports_compare: boolean;
        urgency: string | null;
      }>(
        `select c.id as category_id,
                s.id as service_id,
                c.supports_now, c.supports_schedule, c.supports_compare,
                s.default_urgency::text as urgency
           from categories c
           left join services s
                  on s.category_id = c.id and s.slug = $2 and s.is_active
          where c.slug = $1 and c.is_active`,
        [categorySlug, serviceSlug ?? ''],
      ),
    );

    if (!resolved) {
      throw new ApiError('UNKNOWN_CATEGORY', 'התחום המבוקש אינו נתמך', 422);
    }

    // Category configuration decides which booking modes are legal — this is
    // data, not a hard-coded branch (spec §5, §6).
    const modeSupported =
      (body.bookingMode === 'NOW' && resolved.supports_now) ||
      (body.bookingMode === 'SCHEDULE' && resolved.supports_schedule) ||
      (body.bookingMode === 'COMPARE' && resolved.supports_compare);

    if (!modeSupported) {
      throw new ApiError(
        'MODE_NOT_SUPPORTED',
        'סוג ההזמנה הזה אינו זמין בתחום הנבחר',
        422,
        { bookingMode: body.bookingMode },
      );
    }

    const urgency = understanding.urgency ?? resolved.urgency ?? 'normal';

    // Inserted AS THE CUSTOMER so the RLS insert policy applies: a customer
    // can only ever create a job for themselves.
    const job = await withUser(
      user.id,
      (db) =>
        db.one<{ id: string; status: string }>(
          `insert into jobs
             (customer_id, raw_description, category_id, service_id, urgency,
              understanding, booking_mode, scheduled_for, location,
              location_accuracy_m, address_text, address_notes, status)
           values ($1,$2,$3,$4,$5::urgency_level,$6::jsonb,$7::booking_mode,$8,
                   st_point($10,$9)::geography,$11,$12,$13,'REQUESTED')
           returning id, status::text as status`,
          [
            user.id,
            body.description,
            resolved.category_id,
            resolved.service_id,
            urgency,
            JSON.stringify(understanding),
            body.bookingMode,
            body.scheduledFor ?? null,
            body.lat,
            body.lon,
            body.accuracyM ?? null,
            body.addressText ?? null,
            body.addressNotes ?? null,
          ],
        ),
      { actorRole: 'customer', transitionReason: 'Request created' },
    );

    if (!job) throw new Error('Job insert returned no row');

    logOperation({
      requestId, userId: user.id, jobId: job.id,
      operation: 'jobs.create', result: 'ok',
      durationMs: Date.now() - startedAt,
      meta: { category: categorySlug, mode: body.bookingMode, urgency },
    });

    // Immediate dispatch for NOW jobs (spec §6). Scheduled and compare jobs
    // are not dispatched on creation.
    let dispatch = null;
    if (body.bookingMode === 'NOW') {
      await withSystem(
        async (db) => {
          await db.query(`update jobs set status = 'SEARCHING' where id = $1`, [job.id]);
        },
        { actorRole: 'system', transitionReason: 'Matching started' },
      );

      try {
        dispatch = await runDispatchWave(job.id);
      } catch (error) {
        // A dispatch failure must not lose the job: it stays SEARCHING and
        // the maintenance tick will retry it.
        logOperation({
          requestId, jobId: job.id, operation: 'jobs.create.dispatch', result: 'error',
          meta: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
        });
      }
    }

    return ok(
      {
        id: job.id,
        status: body.bookingMode === 'NOW' ? 'SEARCHING' : 'REQUESTED',
        understanding,
        dispatch: dispatch
          ? {
              wave: dispatch.wave,
              radiusKm: dispatch.radiusKm,
              offersCreated: dispatch.offersCreated,
              candidatesConsidered: dispatch.candidatesConsidered,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error, 'jobs.create', requestId, startedAt);
  }
}

/** The signed-in customer's own jobs. */
export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const jobs = await withUser(user.id, (db) =>
      db.many(
        `select j.id, j.status::text as status, j.raw_description, j.urgency::text as urgency,
                j.booking_mode::text as booking_mode, j.created_at, j.quoted_price_ils,
                j.final_price_ils, c.name_he as category_name, s.name_he as service_name
           from jobs j
           left join categories c on c.id = j.category_id
           left join services s on s.id = j.service_id
          order by j.created_at desc
          limit 50`,
      ),
    );
    return ok({ jobs });
  } catch (error) {
    return handleError(error, 'jobs.list', requestId);
  }
}
