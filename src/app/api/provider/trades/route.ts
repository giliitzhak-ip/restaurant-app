import { z } from 'zod';
import { ApiError, fail, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * A provider proposing a trade the catalog does not have (spec §17).
 *
 * The catalog ships 7 categories and 23 services, which is not the set of
 * trades people actually do. A provider whose work is missing had no way in:
 * the candidate search INNER JOINs provider_categories, so no declared trade
 * means absent from every search, permanently.
 *
 * What this endpoint does NOT do is make them matchable. A proposal is a
 * request for review with no effect on dispatch, and the provider is told so
 * in those words. An admin resolves it; only then does a service exist.
 */

/** Enough to review without becoming a form nobody finishes. */
const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  priceIls: z.number().min(0).max(100_000).optional(),
  /** The provider's own guess at where it belongs. A hint, never binding. */
  suggestedCategorySlug: z.string().trim().max(60).optional(),
});

/**
 * How many proposals a provider may have awaiting review. A queue a human
 * reads is a shared resource, and one account should not be able to fill it.
 */
const MAX_PENDING = 5;

export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');

    const proposals = await withUser(user.id, (db) =>
      db.many(
        `select tp.id, tp.proposed_name, tp.description, tp.price_ils,
                tp.status::text as status, tp.review_note, tp.created_at, tp.reviewed_at,
                sc.name_he as suggested_category_name,
                s.name_he as resolved_service_name,
                rc.name_he as resolved_category_name
           from trade_proposals tp
           left join categories sc on sc.id = tp.suggested_category_id
           left join services s on s.id = tp.resolved_service_id
           left join categories rc on rc.id = s.category_id
          where tp.provider_id = $1
          order by tp.created_at desc
          limit 40`,
        [user.id],
      ),
    );

    return ok({ proposals, maxPending: MAX_PENDING });
  } catch (error) {
    return handleError(error, 'provider.trades.list', requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const user = await requireRole('provider');
    const body = await parseJson(request, createSchema);

    const limit = rateLimit(`trades:${user.id}`, 10, 900);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי בקשות. נסו בעוד כמה דקות.', 429, requestId);
    }

    const created = await withUser(user.id, async (db) => {
      const pending = await db.one<{ n: number }>(
        `select count(*)::int as n from trade_proposals
          where provider_id = $1 and status = 'PENDING'`,
        [user.id],
      );
      if ((pending?.n ?? 0) >= MAX_PENDING) {
        throw new ApiError(
          'TOO_MANY_PENDING',
          `יש לך כבר ${MAX_PENDING} מקצועות שממתינים לאישור. נטפל בהם לפני שאפשר להוסיף עוד.`,
          409,
        );
      }

      let suggestedCategoryId: string | null = null;
      if (body.suggestedCategorySlug) {
        const category = await db.one<{ id: string }>(
          'select id from categories where slug = $1 and is_active',
          [body.suggestedCategorySlug],
        );
        // An unknown slug is dropped rather than rejected: the hint is a
        // convenience for the reviewer, and losing it must not cost the
        // provider their submission.
        suggestedCategoryId = category?.id ?? null;
      }

      return db.one<{ id: string }>(
        `insert into trade_proposals
           (provider_id, proposed_name, description, price_ils, suggested_category_id)
         values ($1,$2,$3,$4,$5)
         returning id`,
        [
          user.id,
          body.name,
          body.description ?? null,
          body.priceIls ?? null,
          suggestedCategoryId,
        ],
      );
    });

    logOperation({
      requestId, userId: user.id, providerId: user.id,
      operation: 'provider.trades.create', result: 'ok',
      durationMs: Date.now() - startedAt,
      meta: { name: body.name.slice(0, 80) },
    });

    return ok(
      {
        id: created?.id,
        status: 'PENDING',
        // Said plainly, because the opposite belief is the expensive one.
        message: 'המקצוע נשלח לאישור. עד שיאושר לא יישלחו לך עבודות בו.',
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error, 'provider.trades.create', requestId, startedAt);
  }
}

/** Withdraw a proposal that has not been reviewed yet. */
export async function DELETE(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !z.uuid().safeParse(id).success) {
      throw new ApiError('INVALID_ID', 'מזהה לא תקין', 422);
    }

    // RLS allows the delete only while the row is PENDING and owned, so a
    // decision that has already been made cannot be erased.
    const removed = await withUser(user.id, (db) =>
      db.query('delete from trade_proposals where id = $1 and provider_id = $2', [id, user.id]),
    );

    if (removed.rowCount === 0) {
      throw new ApiError('NOT_WITHDRAWABLE', 'הבקשה כבר טופלה ולא ניתן לבטל אותה', 409);
    }

    return ok({ id, withdrawn: true });
  } catch (error) {
    return handleError(error, 'provider.trades.delete', requestId);
  }
}
