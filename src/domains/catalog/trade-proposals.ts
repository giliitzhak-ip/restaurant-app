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

/**
 * A category the admin is naming for the first time.
 *
 * A category is not a label — it carries the working radius, the default
 * duration and whether a licence and insurance are demanded before
 * verification. So the two consequential flags are required rather than
 * defaulted: guessing them wrong either lets an unlicensed provider into
 * regulated work or demands papers from a cleaner.
 */
export interface NewCategoryInput {
  /** What an admin typed, e.g. "הובלות". Becomes the category's name. */
  nameHe: string;
  requiresLicense: boolean;
  requiresInsurance: boolean;
  /** How far providers in this trade travel by default. */
  defaultRadiusKm?: number;
  defaultDurationMin?: number;
}

export interface ApproveTradeInput {
  proposalId: string;
  adminId: string;
  /**
   * Where the new service goes. Exactly one of these:
   *   `categorySlug` — an existing category it becomes a service of.
   *   `newCategory`  — a category the admin is creating for it.
   */
  categorySlug?: string;
  newCategory?: NewCategoryInput;
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
  /** True when this approval also brought the category into existence. */
  categoryCreated: boolean;
}

interface ResolvedCategory {
  id: string;
  slug: string;
  name_he: string;
  required_skills: string[];
  created: boolean;
}

/**
 * The category the approved service will live in: an existing one, or a new
 * one the admin is naming.
 *
 * Creating goes through find-or-reuse rather than straight to INSERT, and the
 * lookup is on the trimmed, case-folded name. A second category called
 * "הובלות" is not a new category, it is a split: some providers register
 * under one, customers get routed to the other, and nothing on either screen
 * explains why the work never arrives. Migration 0029 makes the agreement
 * enforceable with a unique index, so a race between two reviewers ends in a
 * constraint violation rather than in two categories.
 */
async function resolveCategory(
  db: DbSession,
  input: ApproveTradeInput,
): Promise<ResolvedCategory> {
  if (input.categorySlug && input.newCategory) {
    throw new ApiError(
      'CATEGORY_AMBIGUOUS',
      'אפשר לבחור תחום קיים או ליצור חדש, לא שניהם',
      422,
    );
  }

  if (input.categorySlug) {
    const existing = await db.one<Omit<ResolvedCategory, 'created'>>(
      `select id, slug, name_he, required_skills
         from categories where slug = $1 and is_active`,
      [input.categorySlug],
    );
    if (!existing) throw new ApiError('UNKNOWN_CATEGORY', 'התחום לא נמצא', 422);
    return { ...existing, created: false };
  }

  const fresh = input.newCategory;
  if (!fresh) {
    throw new ApiError('CATEGORY_REQUIRED', 'חובה לבחור תחום או ליצור חדש', 422);
  }

  const name = fresh.nameHe.trim();
  if (name.length < 2) {
    throw new ApiError('CATEGORY_NAME_REQUIRED', 'שם התחום חסר', 422);
  }

  const byName = await db.one<Omit<ResolvedCategory, 'created'>>(
    `select id, slug, name_he, required_skills
       from categories
      where is_active and lower(btrim(name_he)) = lower(btrim($1))`,
    [name],
  );
  if (byName) return { ...byName, created: false };

  // Identity comes from the proposal, not the words, for the same reason the
  // service's does: Hebrew does not transliterate cleanly into a slug.
  const slug = `cat_${input.proposalId.replace(/-/g, '').slice(0, 12)}`;

  // A category with no required skill scores every provider in it the same
  // neutral 80 — "no skills were defined" — so nobody in a new trade can ever
  // be distinguished by competence. Tagging it with its own slug gives the
  // trade the same shape the seven shipped ones have.
  const created = await db.one<Omit<ResolvedCategory, 'created'>>(
    `insert into categories
       (slug, name_he, name_en, sort_order, is_active,
        supports_now, supports_schedule, supports_compare,
        requires_license, requires_insurance, requires_documents,
        default_duration_min, default_radius_km, required_skills)
     values ($1, $2, null,
             (select coalesce(max(sort_order), 0) + 10 from categories),
             true, true, true, false,
             $3, $4, ($3 or $4),
             $5, $6, array[$1])
     returning id, slug, name_he, required_skills`,
    [
      slug,
      name,
      fresh.requiresLicense,
      fresh.requiresInsurance,
      fresh.defaultDurationMin ?? 60,
      fresh.defaultRadiusKm ?? 15,
    ],
  );
  if (!created) throw new Error('Category insert returned no row');

  return { ...created, created: true };
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

    const category = await resolveCategory(db, input);

    const name = input.serviceName ?? proposal.proposed_name;

    // Identity comes from the proposal id, not the words: Hebrew does not
    // transliterate cleanly into a slug, and a guessable slug is not a
    // feature here.
    const slug = `custom_${proposal.id.replace(/-/g, '').slice(0, 12)}`;

    const price = proposal.price_ils === null ? null : Number(proposal.price_ils);

    const service = await db.one<{ id: string }>(
      `insert into services
         (category_id, slug, name_he, provider_label,
          base_price_ils, min_price_ils, max_price_ils,
          duration_min, default_urgency, strong_phrases, weak_phrases, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::urgency_level,$10,$11,true)
       returning id`,
      [
        category.id,
        slug,
        name,
        // The words the provider used are the provider-facing label, whatever
        // the reviewer renames the customer-facing side to (migration 0030).
        proposal.proposed_name,
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
    // The skills are the category's own, not an empty array. Dispatch takes a
    // job's required skills from the service or, failing that, the category —
    // `coalesce(nullif(s.required_skills,'{}'), c.required_skills)` — and
    // scores them against what the provider holds on this row. An empty array
    // here therefore matched nothing: an approved provider was findable and
    // then ranked about eighteen points below every seeded competitor,
    // permanently, for a skill the approval had just asserted they have. This
    // is what `/api/provider/setup` already does on the ordinary path.
    await db.query(
      `insert into provider_categories (provider_id, category_id, skills, is_primary)
       values ($1,$2,$3,false)
       on conflict (provider_id, category_id) do update
         set skills = (
           select coalesce(array_agg(distinct skill), '{}')
             from unnest(provider_categories.skills || excluded.skills) as skill
         )`,
      [proposal.provider_id, category.id, category.required_skills],
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
        // A new category is a bigger act than a new service, so the trail
        // says which of the two this approval was.
        categoryCreated: category.created,
        categoryName: category.name_he,
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
      categoryCreated: category.created,
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
