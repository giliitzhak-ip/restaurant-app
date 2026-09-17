import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/api/guards';
import { updateProfileSchema } from '@/lib/validation/auth';
import type { ProfileRow } from '@/types/database';

export const GET = route(async () => {
  const { session } = await requireSession();
  return jsonOk({
    user: {
      id: session.userId,
      role: session.role,
      status: session.status,
      fullName: session.fullName,
      email: session.email,
      phone: session.phone,
      avatarUrl: session.avatarUrl,
      providerId: session.providerId,
      providerStatus: session.providerStatus,
    },
  });
});

/** PUT /api/me — profile fields the user owns. Role is never settable here. */
export const PUT = route(async (request: NextRequest) => {
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, updateProfileSchema);

  const profileUpdates: Partial<ProfileRow> = {};
  if (input.fullName !== undefined) profileUpdates.full_name = input.fullName;
  if (input.phone !== undefined) profileUpdates.phone = input.phone;
  if (input.avatarUrl !== undefined) profileUpdates.avatar_url = input.avatarUrl;
  if (input.locale !== undefined) profileUpdates.locale = input.locale;

  if (Object.keys(profileUpdates).length) {
    const { error } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('user_id', session.userId);
    if (error) throw ApiError.badRequest('עדכון הפרופיל נכשל', error.message);
  }

  if (input.phone !== undefined) {
    await supabase.from('users').update({ phone: input.phone }).eq('id', session.userId);
  }

  if (
    session.role === 'customer' &&
    (input.defaultAddress !== undefined ||
      input.defaultLat !== undefined ||
      input.defaultLng !== undefined)
  ) {
    const { error } = await supabase
      .from('customer_profiles')
      .update({
        ...(input.defaultAddress !== undefined ? { default_address: input.defaultAddress } : {}),
        ...(input.defaultLat !== undefined ? { default_lat: input.defaultLat } : {}),
        ...(input.defaultLng !== undefined ? { default_lng: input.defaultLng } : {}),
      })
      .eq('user_id', session.userId);
    if (error) throw ApiError.badRequest('עדכון הכתובת נכשל', error.message);
  }

  return jsonOk({ updated: true });
});
