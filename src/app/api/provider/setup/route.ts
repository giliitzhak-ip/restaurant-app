import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import { logOperation, newRequestId } from '@/lib/logger';

/**
 * Provider onboarding (spec §31, and the missing half of §5's build order).
 *
 * Registration alone produces a provider who can NEVER be matched:
 * find_candidate_providers INNER JOINs provider_categories, so with no
 * category row the provider is not a candidate at all — not ranked low,
 * simply absent. This endpoint is what makes a registered account into a
 * working one.
 *
 * Everything is written AS THE PROVIDER through withUser, so the existing RLS
 * policies (`provider_id = auth.uid()`) are the thing authorising it. A
 * provider cannot configure anyone else's trade, and this handler contains no
 * ownership check of its own because it does not need one.
 *
 * Deliberately NOT settable here: `verification`. A provider cannot verify
 * themselves — the guard_provider_verification trigger rejects it — so
 * onboarding ends in PENDING and an admin decides.
 */

const priceSchema = z.object({
  serviceSlug: z.string().min(1).max(60),
  // Providers price their own work; this is the server-side source of truth
  // for what a job is worth (spec §45).
  priceIls: z.number().min(0).max(100_000),
});

const bodySchema = z.object({
  categorySlug: z.string().min(1).max(60),
  businessName: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(1000).optional(),
  yearsExperience: z.number().int().min(0).max(70),
  maxRadiusKm: z.number().min(0.5).max(200),
  services: z.array(priceSchema).min(1).max(40),
  serviceArea: z.object({
    label: z.string().trim().max(120).optional(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    radiusKm: z.number().min(0.5).max(200),
  }),
  payout: z
    .object({
      method: z.enum(['bank_transfer', 'other']),
      bank: z.string().trim().max(40).optional(),
      branch: z.string().trim().max(40).optional(),
      account: z.string().trim().max(60).optional(),
    })
    .optional(),
});

export async function PUT(request: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const user = await requireRole('provider');
    const body = await parseJson(request, bodySchema);

    // Resolve the trade and its services against the catalog. A client-sent
    // slug is a selection, never a definition: an unknown slug is rejected
    // rather than created.
    const catalog = await withSystem(async (db) => {
      const category = await db.one<{ id: string; required_skills: string[]; name_he: string }>(
        `select id, required_skills, name_he
           from categories where slug = $1 and is_active`,
        [body.categorySlug],
      );
      if (!category) return null;

      const services = await db.many<{ id: string; slug: string }>(
        `select id, slug from services
          where category_id = $1 and is_active and slug = any($2::text[])`,
        [category.id, body.services.map((s) => s.serviceSlug)],
      );
      return { category, services };
    });

    if (!catalog) {
      throw new ApiError('UNKNOWN_CATEGORY', 'התחום המבוקש אינו נתמך', 422);
    }

    const byslug = new Map(catalog.services.map((s) => [s.slug, s.id]));
    const unknown = body.services.filter((s) => !byslug.has(s.serviceSlug));
    if (unknown.length > 0) {
      throw new ApiError(
        'UNKNOWN_SERVICE',
        'אחד השירותים שנבחרו אינו קיים בתחום הזה',
        422,
        { services: unknown.map((s) => s.serviceSlug) },
      );
    }

    // One transaction: a provider is never left half-configured — with a
    // trade but no prices, say — because that state is matchable but broken.
    const result = await withUser(user.id, async (db) => {
      await db.query(
        `update provider_profiles
            set business_name = coalesce($2, business_name),
                bio = coalesce($3, bio),
                years_experience = $4,
                max_radius_km = $5
          where id = $1`,
        [
          user.id,
          body.businessName ?? null,
          body.bio ?? null,
          body.yearsExperience,
          body.maxRadiusKm,
        ],
      );

      // A provider works one primary trade in the MVP, so switching trade
      // replaces the old rows rather than accumulating them.
      await db.query('delete from provider_categories where provider_id = $1', [user.id]);
      await db.query(
        `insert into provider_categories (provider_id, category_id, skills, is_primary)
         values ($1, $2, $3, true)`,
        [user.id, catalog.category.id, catalog.category.required_skills],
      );

      await db.query('delete from provider_services where provider_id = $1', [user.id]);
      for (const service of body.services) {
        // Non-null is safe: unknown slugs were rejected above.
        const serviceId = byslug.get(service.serviceSlug);
        if (!serviceId) continue;
        await db.query(
          `insert into provider_services (provider_id, service_id, price_ils, is_active)
           values ($1, $2, $3, true)`,
          [user.id, serviceId, service.priceIls],
        );
      }

      await db.query('delete from service_areas where provider_id = $1', [user.id]);
      await db.query(
        `insert into service_areas (provider_id, label, center, radius_km, is_active)
         values ($1, $2, st_point($4, $3)::geography, $5, true)`,
        [
          user.id,
          body.serviceArea.label ?? 'אזור עבודה ראשי',
          body.serviceArea.lat,
          body.serviceArea.lon,
          body.serviceArea.radiusKm,
        ],
      );

      if (body.payout) {
        await db.query(
          `insert into provider_payout_details (provider_id, method, details)
           values ($1, $2, $3::jsonb)
           on conflict (provider_id) do update
             set method = excluded.method, details = excluded.details`,
          [
            user.id,
            body.payout.method,
            JSON.stringify({
              bank: body.payout.bank ?? null,
              branch: body.payout.branch ?? null,
              account: body.payout.account ?? null,
            }),
          ],
        );
      }

      return db.one<{ verification: string }>(
        `select verification::text as verification from provider_profiles where id = $1`,
        [user.id],
      );
    });

    logOperation({
      requestId,
      userId: user.id,
      providerId: user.id,
      operation: 'provider.setup',
      result: 'ok',
      durationMs: Date.now() - startedAt,
      meta: {
        category: body.categorySlug,
        services: body.services.length,
        radiusKm: body.maxRadiusKm,
      },
    });

    return ok({
      categorySlug: body.categorySlug,
      categoryName: catalog.category.name_he,
      servicesConfigured: body.services.length,
      verification: result?.verification ?? 'PENDING',
      // Says plainly what still stands between them and work.
      nextStep:
        result?.verification === 'VERIFIED'
          ? 'ready'
          : 'awaiting_verification',
    });
  } catch (error) {
    return handleError(error, 'provider.setup', requestId, startedAt);
  }
}
