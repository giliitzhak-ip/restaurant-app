import { ApiError } from '@/lib/api';
import { withUser, type DbSession } from '@/lib/db';
import { invalidateCatalogRulesCache } from '@/domains/jobs/understanding-catalog';

/**
 * Resolving a provider-proposed trade (spec §17, §33).
 *
 * This is the only path by which the catalog grows, and it is the most
 * consequential write an admin makes: it creates a service customers can be
 * routed to, and it decides whether a provider can earn. It lives here rather
 * than in the route handler so it can be tested against a real database —
 * the authorization, the atomicity and the reachability are all properties of
 * what happens in the transaction, not of the HTTP wrapper.
 *
 * Authorization is RLS, not a check in this function. Everything runs as the
 * calling admin: `services` is writable only where `is_admin()`, and
 * `trade_proposals` has no UPDATE policy for the owning provider at all, so a
 * provider reaching this code path writes nothing.
 */

export interface ApproveTradeInput {
  proposalId: string;
  adminId: string;
  /** The existing category it becomes a service of. */
  categorySlug: string;
  /** Customer phrasings that should route here. At least one, always. */
  phrases: string[];
  weakPhrases?: string[];
  serviceName?: string;
  urgency?: 'low' | 'normal' | 'high' | 'emergency';
  durationMin?: number;
  note?: string;
  /** Writes the audit row inside the same transaction as the change. */
  audit: (
    db: DbSession,
    action: string,
    targetType: string,
    targetId: string | null,
    before: unknown,
    after: unknown,
    reason?: string,
  ) => Promise<unknown>;
}

export interface ApprovedTrade {
  serviceId: string;
  slug: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  providerId: string;
}

export async function approveTradeProposal(input: ApproveTradeInput): Promise<ApprovedTrade> {
  if (input.phrases.length === 0) {
    // Belt as well as braces: the API schema requires these, and so does the
    // only other caller. A service with no phrases is unreachable by any
    // description, so approving one would tell a provider they can earn when
    // they cannot.
    throw new ApiError('PHRASES_REQUIRED', 'חובה לציין לפחות ביטוי אחד', 422);
  }

  const result = await withUser(input.adminId, async (db) => {
    const proposal = await db.one<{
      id: string; provider_id: string; proposed_name: string;
      price_ils: string | null; status: string;
    }>(
      `select id, provider_id, proposed_name, price_ils, status::text as status
         from trade_proposals where id = $1`,
      [input.proposalId],
    );
    if (!proposal) throw new ApiError('NOT_FOUND', 'הבקשה לא נמצאה', 404);
    if (proposal.status !== 'PENDING') {
      throw new ApiError('ALREADY_RESOLVED', 'הבקשה כבר טופלה', 409, {
        status: proposal.status,
      });
    }

    const category = await db.one<{ id: string; slug: string; name_he: string }>(
      'select id, slug, name_he from categories where slug = $1 and is_active',
      [input.categorySlug],
    );
    if (!category) throw new ApiError('UNKNOWN_CATEGORY', 'התחום לא נמצא', 422);

    const name = input.serviceName ?? proposal.proposed_name;

    // Identity comes from the proposal id, not the words: Hebrew does not
    // transliterate cleanly into a slug, and a guessable slug is not a
    // feature here.
    const slug = `custom_${proposal.id.replace(/-/g, '').slice(0, 12)}`;

    const price = proposal.price_ils === null ? null : Number(proposal.price_ils);

    const service = await db.one<{ id: string }>(
      `insert into services
         (category_id, slug, name_he, base_price_ils, min_price_ils, max_price_ils,
          duration_min, default_urgency, strong_phrases, weak_phrases, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8::urgency_level,$9,$10,true)
       returning id`,
      [
        category.id,
        slug,
        name,
        price,
        // A band around what the provider asked for, so the guidance the next
        // provider sees is anchored to something real. No price means no
        // guidance, which is the honest answer rather than an invented one.
        price === null ? null : Math.round(price * 0.7),
        price === null ? null : Math.round(price * 1.6),
        input.durationMin ?? 60,
        input.urgency ?? 'normal',
        input.phrases,
        input.weakPhrases ?? [],
      ],
    );
    if (!service) throw new Error('Service insert returned no row');

    // Both links matter. provider_categories is what the candidate search
    // INNER JOINs; provider_services is what gives them a price. Either one
    // alone leaves the provider unmatchable, which is the whole failure this
    // feature exists to end.
    await db.query(
      `insert into provider_categories (provider_id, category_id, skills, is_primary)
       values ($1,$2,'{}',false)
       on conflict (provider_id, category_id) do nothing`,
      [proposal.provider_id, category.id],
    );
    await db.query(
      `insert into provider_services (provider_id, service_id, price_ils, is_active)
       values ($1,$2,$3,true)`,
      [proposal.provider_id, service.id, price],
    );

    await db.query(
      `update trade_proposals
          set status = 'APPROVED', reviewed_by = $2, reviewed_at = now(),
              review_note = $3, resolved_service_id = $4
        where id = $1`,
      [input.proposalId, input.adminId, input.note ?? null, service.id],
    );

    await input.audit(
      db, 'approve_trade', 'trade_proposal', input.proposalId,
      { status: 'PENDING', proposedName: proposal.proposed_name },
      {
        status: 'APPROVED', serviceId: service.id, slug,
        categorySlug: category.slug, phrases: input.phrases,
      },
      input.note,
    );

    return {
      serviceId: service.id,
      slug,
      name,
      categorySlug: category.slug,
      categoryName: category.name_he,
      providerId: proposal.provider_id,
    };
  });

  // The classifier caches catalog phrases; drop it so a reviewer sees the
  // effect of their own decision instead of waiting out a TTL.
  invalidateCatalogRulesCache();

  return result;
}

export async function rejectTradeProposal(input: {
  proposalId: string;
  adminId: string;
  reason: string;
  audit: ApproveTradeInput['audit'];
}): Promise<{ providerId: string }> {
  return withUser(input.adminId, async (db) => {
    const proposal = await db.one<{
      status: string; provider_id: string; proposed_name: string;
    }>(
      `select status::text as status, provider_id, proposed_name
         from trade_proposals where id = $1`,
      [input.proposalId],
    );
    if (!proposal) throw new ApiError('NOT_FOUND', 'הבקשה לא נמצאה', 404);
    if (proposal.status !== 'PENDING') {
      throw new ApiError('ALREADY_RESOLVED', 'הבקשה כבר טופלה', 409);
    }

    await db.query(
      `update trade_proposals
          set status = 'REJECTED', reviewed_by = $2, reviewed_at = now(), review_note = $3
        where id = $1`,
      [input.proposalId, input.adminId, input.reason],
    );

    await input.audit(
      db, 'reject_trade', 'trade_proposal', input.proposalId,
      { status: 'PENDING', proposedName: proposal.proposed_name },
      { status: 'REJECTED' },
      input.reason,
    );

    return { providerId: proposal.provider_id };
  });
}
