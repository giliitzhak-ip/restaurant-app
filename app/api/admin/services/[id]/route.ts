import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { serviceInputSchema } from '@/lib/validation/admin';

export const PUT = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, serviceInputSchema.partial());

  const { data, error } = await admin
    .from('services')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameEn !== undefined ? { name_en: input.nameEn } : {}),
      ...(input.basePrice !== undefined ? { base_price: input.basePrice } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) throw ApiError.badRequest('עדכון השירות נכשל', error?.message);

  await logAdminAction(session.userId, 'service_update', 'services', id, input);
  return jsonOk({ service: data });
});

export const DELETE = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();

  const { count } = await admin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', id);

  if ((count ?? 0) > 0) {
    throw ApiError.conflict(`לא ניתן למחוק שירות עם ${count} עבודות. אפשר לבטל את הפעלתו במקום.`);
  }

  const { error } = await admin.from('services').delete().eq('id', id);
  if (error) throw ApiError.badRequest('מחיקת השירות נכשלה', error.message);

  await logAdminAction(session.userId, 'service_delete', 'services', id, {});
  return jsonOk({ deleted: true });
});
