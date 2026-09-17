import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { serviceInputSchema } from '@/lib/validation/admin';

export const POST = route(async (request: NextRequest) => {
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, serviceInputSchema);

  const { data, error } = await admin
    .from('services')
    .insert({
      category_id: input.categoryId,
      slug: input.slug,
      name: input.name,
      name_en: input.nameEn ?? null,
      base_price: input.basePrice ?? null,
      sort_order: input.sortOrder,
      active: input.active,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw ApiError.conflict('כבר קיים שירות עם המזהה הזה בקטגוריה');
    throw ApiError.badRequest('יצירת השירות נכשלה', error.message);
  }

  await logAdminAction(session.userId, 'service_create', 'services', data.id, { slug: input.slug });
  return jsonOk({ service: data }, 201);
});
