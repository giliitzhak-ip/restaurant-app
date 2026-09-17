import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { categoryInputSchema, reorderCategoriesSchema } from '@/lib/validation/admin';

export const GET = route(async () => {
  await requireAdmin();
  const admin = requireServiceClient();

  const { data, error } = await admin
    .from('categories')
    .select('*, services (id, name, slug, active, sort_order, base_price)')
    .order('sort_order', { ascending: true });

  if (error) throw ApiError.badRequest('לא ניתן לטעון קטגוריות', error.message);
  return jsonOk({ categories: data ?? [] });
});

export const POST = route(async (request: NextRequest) => {
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, categoryInputSchema);

  const { data, error } = await admin
    .from('categories')
    .insert({
      slug: input.slug,
      name: input.name,
      name_en: input.nameEn ?? null,
      icon: input.icon,
      description: input.description ?? null,
      sort_order: input.sortOrder,
      active: input.active,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw ApiError.conflict('כבר קיימת קטגוריה עם המזהה הזה');
    throw ApiError.badRequest('יצירת הקטגוריה נכשלה', error.message);
  }

  await logAdminAction(session.userId, 'category_create', 'categories', data.id, { slug: input.slug });
  return jsonOk({ category: data }, 201);
});

/** PUT /api/admin/categories — drag-and-drop reordering. */
export const PUT = route(async (request: NextRequest) => {
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const { order } = await parseBody(request, reorderCategoriesSchema);

  await Promise.all(
    order.map((entry) =>
      admin.from('categories').update({ sort_order: entry.sortOrder }).eq('id', entry.id),
    ),
  );

  await logAdminAction(session.userId, 'category_reorder', 'categories', null, { count: order.length });
  return jsonOk({ reordered: order.length });
});
