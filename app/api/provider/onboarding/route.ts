import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider, requireServiceClient } from '@/lib/api/guards';
import { submitOnboardingSchema } from '@/lib/validation/providers';

/**
 * POST /api/provider/onboarding — submit the profile for verification.
 *
 * The provider does not become `verified` here: that is an admin decision. All
 * this does is complete onboarding and put them in the review queue.
 */
export const POST = route(async (request: NextRequest) => {
  const { supabase, providerId } = await requireProvider();
  await parseBody(request, submitOnboardingSchema);

  const { data: profile } = await supabase
    .from('provider_profiles')
    .select(
      `id, business_name, owner_name, phone, status,
       provider_categories (id), service_areas (id), provider_documents (id)`,
    )
    .eq('id', providerId)
    .maybeSingle();

  if (!profile) throw ApiError.notFound('הפרופיל לא נמצא');

  const missing: string[] = [];
  if (!profile.business_name?.trim()) missing.push('שם העסק');
  if (!profile.owner_name?.trim()) missing.push('שם בעל העסק');
  if (!profile.phone?.trim()) missing.push('טלפון');
  if (!profile.provider_categories?.length) missing.push('לפחות תחום אחד');
  if (!profile.service_areas?.length) missing.push('לפחות אזור שירות אחד');
  if (!profile.provider_documents?.length) missing.push('לפחות מסמך אימות אחד');

  if (missing.length) {
    throw ApiError.badRequest(`חסרים פרטים: ${missing.join(', ')}`, { missing });
  }

  const { error } = await supabase
    .from('provider_profiles')
    .update({
      onboarding_completed: true,
      onboarding_step: 9,
      terms_accepted_at: new Date().toISOString(),
    })
    .eq('id', providerId);

  if (error) throw ApiError.badRequest('שליחת הבקשה נכשלה', error.message);

  // A rejected provider who resubmits goes back into the pending queue.
  if (profile.status === 'rejected') {
    const admin = requireServiceClient();
    await admin
      .from('provider_profiles')
      .update({ status: 'pending', status_reason: null })
      .eq('id', providerId);
  }

  return jsonOk({ submitted: true });
});
