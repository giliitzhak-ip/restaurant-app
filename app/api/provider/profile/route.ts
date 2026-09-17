import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider } from '@/lib/api/guards';
import { updateProviderProfileSchema } from '@/lib/validation/providers';
import type { ProviderProfileRow } from '@/types/database';

const PROFILE_SELECT = `
  *,
  provider_categories (id, category_id, categories (id, name, slug, icon)),
  provider_services (id, service_id, price_from, services (id, name, slug, category_id)),
  service_areas (id, label, center_lat, center_lng, radius_km),
  provider_availability (is_available, available_until),
  provider_documents (id, doc_type, status, file_name, review_note, created_at),
  provider_gallery (id, storage_path, caption, sort_order)
`;

export const GET = route(async () => {
  const { supabase, providerId } = await requireProvider();

  const { data, error } = await supabase
    .from('provider_profiles')
    .select(PROFILE_SELECT)
    .eq('id', providerId)
    .maybeSingle();

  if (error) throw ApiError.badRequest('לא ניתן לטעון את הפרופיל', error.message);
  if (!data) throw ApiError.notFound('הפרופיל לא נמצא');

  return jsonOk({ profile: data });
});

/**
 * PUT /api/provider/profile
 *
 * Presentation and coverage only. Verification status, rating and job counters
 * are stripped by the `guard_provider_protected_columns` trigger even if a
 * client tries to send them.
 */
export const PUT = route(async (request: NextRequest) => {
  const { supabase, providerId } = await requireProvider();
  const input = await parseBody(request, updateProviderProfileSchema);

  const updates: Partial<ProviderProfileRow> = {};
  if (input.businessName !== undefined) updates.business_name = input.businessName;
  if (input.ownerName !== undefined) updates.owner_name = input.ownerName;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.bio !== undefined) updates.bio = input.bio;
  if (input.yearsExperience !== undefined) updates.years_experience = input.yearsExperience;
  if (input.basePrice !== undefined) updates.base_price = input.basePrice;
  if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl;
  if (input.logoUrl !== undefined) updates.logo_url = input.logoUrl;
  if (input.onboardingStep !== undefined) updates.onboarding_step = input.onboardingStep;
  if (input.acceptTerms) updates.terms_accepted_at = new Date().toISOString();

  if (Object.keys(updates).length) {
    const { error } = await supabase.from('provider_profiles').update(updates).eq('id', providerId);
    if (error) throw ApiError.badRequest('עדכון הפרופיל נכשל', error.message);
  }

  if (input.categoryIds) {
    await supabase.from('provider_categories').delete().eq('provider_id', providerId);
    if (input.categoryIds.length) {
      const { error } = await supabase
        .from('provider_categories')
        .insert(input.categoryIds.map((categoryId) => ({ provider_id: providerId, category_id: categoryId })));
      if (error) throw ApiError.badRequest('שמירת התחומים נכשלה', error.message);
    }
  }

  if (input.serviceIds) {
    await supabase.from('provider_services').delete().eq('provider_id', providerId);
    if (input.serviceIds.length) {
      const { error } = await supabase
        .from('provider_services')
        .insert(input.serviceIds.map((serviceId) => ({ provider_id: providerId, service_id: serviceId })));
      if (error) throw ApiError.badRequest('שמירת השירותים נכשלה', error.message);
    }
  }

  if (input.serviceAreas) {
    await supabase.from('service_areas').delete().eq('provider_id', providerId);
    if (input.serviceAreas.length) {
      const { error } = await supabase.from('service_areas').insert(
        input.serviceAreas.map((area) => ({
          provider_id: providerId,
          label: area.label,
          center_lat: area.centerLat,
          center_lng: area.centerLng,
          radius_km: area.radiusKm,
        })),
      );
      if (error) throw ApiError.badRequest('שמירת אזורי השירות נכשלה', error.message);
    }
  }

  const { data } = await supabase
    .from('provider_profiles')
    .select(PROFILE_SELECT)
    .eq('id', providerId)
    .maybeSingle();

  return jsonOk({ profile: data });
});
