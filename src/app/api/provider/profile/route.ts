import { handleError, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withAnon, withUser } from '@/lib/db';
import { newRequestId } from '@/lib/logger';

/**
 * Everything the onboarding screen needs: the catalog to choose from, and
 * whatever the provider has already configured.
 *
 * `isConfigured` is the field that matters operationally. It is false until
 * the provider holds at least one category AND one priced service — which is
 * exactly the condition find_candidate_providers requires, so it answers
 * "can this account actually receive work?" rather than "is the form filled
 * in?".
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');

    // The catalog is public reference data.
    const catalog = await withAnon(async (db) => {
      const categories = await db.many<{
        slug: string; name_he: string; icon: string | null;
        default_radius_km: string; requires_license: boolean;
        requires_insurance: boolean; requires_documents: boolean;
      }>(
        `select slug, name_he, icon, default_radius_km,
                requires_license, requires_insurance, requires_documents
           from categories where is_active order by sort_order`,
      );
      const services = await db.many<{
        category_slug: string; slug: string; name_he: string;
        base_price_ils: string | null; min_price_ils: string | null; max_price_ils: string | null;
      }>(
        `select c.slug as category_slug, s.slug, s.name_he,
                s.base_price_ils, s.min_price_ils, s.max_price_ils
           from services s
           join categories c on c.id = s.category_id
          where s.is_active and c.is_active
          order by c.sort_order, s.name_he`,
      );
      return { categories, services };
    });

    const current = await withUser(user.id, async (db) => {
      const profile = await db.one<{
        business_name: string | null; bio: string | null;
        years_experience: number; max_radius_km: string;
        verification: string; state: string; full_name: string;
      }>(
        `select pp.business_name, pp.bio, pp.years_experience, pp.max_radius_km,
                pp.verification::text as verification, pp.state::text as state,
                p.full_name
           from provider_profiles pp
           join profiles p on p.id = pp.id
          where pp.id = $1`,
        [user.id],
      );

      const categories = await db.many<{ slug: string }>(
        `select c.slug
           from provider_categories pc
           join categories c on c.id = pc.category_id
          where pc.provider_id = $1`,
        [user.id],
      );

      const services = await db.many<{ slug: string; price_ils: string | null }>(
        `select s.slug, ps.price_ils
           from provider_services ps
           join services s on s.id = ps.service_id
          where ps.provider_id = $1 and ps.is_active`,
        [user.id],
      );

      const area = await db.one<{ label: string | null; lat: number; lon: number; radius_km: string }>(
        `select label,
                st_y(center::geometry) as lat,
                st_x(center::geometry) as lon,
                radius_km
           from service_areas
          where provider_id = $1 and is_active
          limit 1`,
        [user.id],
      );

      const payout = await db.one<{ method: string | null }>(
        `select method from provider_payout_details where provider_id = $1`,
        [user.id],
      );

      return { profile, categories, services, area, payout };
    });

    const pricedServices = current.services.filter((s) => s.price_ils !== null);

    return ok({
      catalog,
      profile: current.profile,
      categorySlug: current.categories[0]?.slug ?? null,
      services: current.services,
      serviceArea: current.area,
      hasPayoutDetails: current.payout !== null,
      // The operational question, not a form-completeness flag.
      isConfigured: current.categories.length > 0 && pricedServices.length > 0,
      canReceiveWork:
        current.categories.length > 0 &&
        pricedServices.length > 0 &&
        current.profile?.verification === 'VERIFIED',
    });
  } catch (error) {
    return handleError(error, 'provider.profile', requestId);
  }
}
