import { z } from 'zod';
import { ApiError, fail, handleError, ok } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { withSystem } from '@/lib/db';
import { availabilityPhrase, availabilitySummary } from '@/domains/availability/summary';
import { newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * The provider profile a CUSTOMER sees (spec §17–§19).
 *
 * Read with the system role and then deliberately narrowed, rather than
 * returning a row: this endpoint is reachable by any signed-in customer, so
 * the shape of the response IS the privacy boundary.
 *
 * Included: identity, rating, verification, completed jobs, relevant
 * services, service areas, reviews, and ONE availability answer.
 *
 * Excluded on purpose: the provider's full weekly calendar (spec §56 — the
 * customer needs to know when this provider can serve them, not the
 * provider's personal schedule), exact live coordinates, payout details,
 * moderation notes, cancellation counts and internal match scores (§34).
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    // Requires a session: provider profiles are not an anonymous directory.
    const user = await getCurrentUser();
    if (!user) throw new ApiError('UNAUTHENTICATED', 'נדרשת התחברות', 401);

    /*
     * Rate limited per viewer. A profile is meant to be read at a decision
     * point — one match, one tap — not walked. Without this, any account can
     * enumerate every verified provider's prices and service list by id. The
     * ceiling is well above real use and well below a scrape.
     */
    const limit = rateLimit(`providers:${user.id}`, 60, 300);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי בקשות. נסו בעוד כמה דקות.', 429, requestId);
    }

    const { id } = paramsSchema.parse(await context.params);
    const serviceSlug = new URL(request.url).searchParams.get('service');

    const data = await withSystem(async (db) => {
      const profile = await db.one<{
        id: string; full_name: string; business_name: string | null; bio: string | null;
        years_experience: number; verification: string; state: string;
        rating_avg: string | null; rating_count: number; completed_jobs: number;
        avg_response_seconds: number | null; member_since: Date;
      }>(
        `select pp.id, p.full_name, pp.business_name, pp.bio,
                pp.years_experience,
                pp.verification::text as verification,
                pp.state::text as state,
                pp.rating_avg, pp.rating_count, pp.completed_jobs,
                pp.avg_response_seconds,
                pp.created_at as member_since
           from provider_profiles pp
           join profiles p on p.id = pp.id
          where pp.id = $1
            -- Only a verified provider has a customer-facing profile.
            and pp.verification = 'VERIFIED'`,
        [id],
      );

      if (!profile) return null;

      const services = await db.many<{ slug: string; name_he: string; price_ils: string | null; category_name: string }>(
        // "What this person does" is a list of services, not of symptoms,
        // even when a customer is the one reading it (migration 0030).
        `select s.slug, coalesce(s.provider_label, s.name_he) as name_he,
                ps.price_ils, c.name_he as category_name
           from provider_services ps
           join services s on s.id = ps.service_id
           join categories c on c.id = s.category_id
          where ps.provider_id = $1 and ps.is_active and ps.price_ils is not null
          order by c.sort_order, coalesce(s.provider_label, s.name_he)`,
        [id],
      );

      const areas = await db.many<{ label: string | null; radius_km: string }>(
        `select label, radius_km from service_areas
          where provider_id = $1 and is_active order by radius_km desc limit 4`,
        [id],
      );

      const reviews = await db.many<{
        rating: number; comment: string | null; created_at: Date;
        author_name: string; punctuality: number | null; professionalism: number | null;
      }>(
        // Only real reviews attached to completed jobs, and only the
        // reviewer's first name — a review is not an introduction to them.
        `select r.rating, r.comment, r.created_at,
                split_part(p.full_name, ' ', 1) as author_name,
                r.punctuality, r.professionalism
           from reviews r
           join profiles p on p.id = r.author_id
          where r.subject_id = $1
            and r.direction = 'customer_to_provider'
            and r.comment is not null
          order by r.created_at desc
          limit 5`,
        [id],
      );

      const ratingBreakdown = await db.one<Record<string, string>>(
        `select
           count(*) filter (where rating = 5)::text as five,
           count(*) filter (where rating = 4)::text as four,
           count(*) filter (where rating = 3)::text as three,
           count(*) filter (where rating <= 2)::text as low
         from reviews
         where subject_id = $1 and direction = 'customer_to_provider'`,
        [id],
      );

      return { profile, services, areas, reviews, ratingBreakdown };
    });

    if (!data) throw new ApiError('NOT_FOUND', 'הפרופיל לא נמצא', 404);

    const { profile } = data;

    const ratingRows =
      Number(data.ratingBreakdown?.five ?? 0) +
      Number(data.ratingBreakdown?.four ?? 0) +
      Number(data.ratingBreakdown?.three ?? 0) +
      Number(data.ratingBreakdown?.low ?? 0);

    // ONE availability answer, not a calendar (spec §55, §56). The same
    // helper the provider's own screen uses, so both sides of the market are
    // told the same thing.
    const availability = await availabilitySummary(id);

    return ok({
      id: profile.id,
      fullName: profile.full_name,
      businessName: profile.business_name,
      bio: profile.bio,
      // Initials, so the UI has a consistent fallback avatar without a
      // fabricated photograph (spec §20).
      initials: profile.full_name
        .split(' ')
        .slice(0, 2)
        .map((part) => part[0] ?? '')
        .join(''),
      yearsExperience: profile.years_experience,
      isVerified: profile.verification === 'VERIFIED',
      // null rather than 0.0 for a provider with no reviews: the UI shows
      // "חדש ב-GET SERVICE" instead of a misleading zero (spec §27).
      ratingAvg: profile.rating_avg === null ? null : Number(profile.rating_avg),
      ratingCount: profile.rating_count,
      completedJobs: profile.completed_jobs,
      isNew: profile.rating_count === 0 && profile.completed_jobs === 0,
      avgResponseSeconds: profile.avg_response_seconds,
      memberSince: profile.member_since,
      /**
       * The star distribution comes from real review ROWS, while ratingAvg
       * and ratingCount are columns on the provider record. Those can
       * disagree — a migrated or seeded provider carries an aggregate with no
       * individual reviews behind it — and when they do, the honest answer is
       * null rather than a 0/0/0/0 breakdown that reads as "nobody gave five
       * stars" (spec §27, §72).
       */
      ratingBreakdown: ratingRows > 0
        ? {
            five: Number(data.ratingBreakdown?.five ?? 0),
            four: Number(data.ratingBreakdown?.four ?? 0),
            three: Number(data.ratingBreakdown?.three ?? 0),
            low: Number(data.ratingBreakdown?.low ?? 0),
          }
        : null,
      // All the provider's services are listed — a customer deciding who to
      // trust wants to see the breadth of what they do (spec §17) — with the
      // requested one flagged so the UI can lead with it.
      services: data.services
        .map((s) => ({
          slug: s.slug,
          name: s.name_he,
          categoryName: s.category_name,
          priceIls: s.price_ils === null ? null : Number(s.price_ils),
          isRequested: serviceSlug !== null && s.slug === serviceSlug,
        })),
      serviceAreas: data.areas.map((a) => ({
        label: a.label,
        radiusKm: Number(a.radius_km),
      })),
      reviews: data.reviews.map((r) => ({
        rating: r.rating,
        comment: r.comment,
        authorName: r.author_name,
        createdAt: r.created_at,
        punctuality: r.punctuality,
        professionalism: r.professionalism,
      })),
      availability: {
        availableNow: availability.availableNow,
        nextAvailableAt: availability.nextAvailableAt,
        // Pre-phrased on the server so every surface says it identically,
        // and so the answer does not depend on the browser's timezone.
        phrase: availabilityPhrase(availability, new Date()),
      },
    });
  } catch (error) {
    return handleError(error, 'providers.profile', requestId);
  }
}
