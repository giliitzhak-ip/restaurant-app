import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { categoryInputSchema } from '@/lib/validation/admin';

export const PUT = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, categoryInputSchema.partial());

  const { data, error } = await admin
    .from('categories')
    .update({
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameEn !== undefined ? { name_en: input.nameEn } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) throw ApiError.badRequest('עדכון הקטגוריה נכשל', error?.message);

  await logAdminAction(session.userId, 'category_update', 'categories', id, input);
  return jsonOk({ category: data });
});

/**
 * DELETE /api/admin/categories/:id
 *
 * Refuses to delete a category that has jobs attached — history must stay
 * readable. Deactivate it instead; the UI offers that as the alternative.
 */
export const DELETE = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();

  const { count } = await admin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if ((count ?? 0) > 0) {
    throw ApiError.conflict(
      `לא ניתן למחוק קטגוריה עם ${count} עבודות. אפשר לבטל את הפעלתה במקום.`,
    );
  }

  const { error } = await admin.from('categories').delete().eq('id', id);
  if (error) throw ApiError.badRequest('מחיקת הקטגוריה נכשלה', error.message);

  await logAdminAction(session.userId, 'category_delete', 'categories', id, {});
  return jsonOk({ deleted: true });
});
