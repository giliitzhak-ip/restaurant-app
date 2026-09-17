import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/api/guards';

const listSchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** GET /api/notifications — the in-app notification centre. */
export const GET = route(async (request: NextRequest) => {
  const { session, supabase } = await requireSession();
  const { unreadOnly, limit } = parseQuery(request, listSchema);

  let query = supabase
    .from('notifications')
    .select('id, event, title, body, job_id, read_at, created_at', { count: 'exact' })
    .eq('user_id', session.userId)
    .eq('channel', 'in_app')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.is('read_at', null);

  const { data, error, count } = await query;
  if (error) throw ApiError.badRequest('לא ניתן לטעון התראות', error.message);

  return jsonOk({ notifications: data ?? [], total: count ?? 0 });
});

/** POST /api/notifications — mark one, or all, as read. */
export const POST = route(async (request: NextRequest) => {
  const { session, supabase } = await requireSession();
  const { id, all } = await parseBody(
    request,
    z.object({ id: z.string().uuid().optional(), all: z.boolean().default(false) }),
  );

  if (!id && !all) throw ApiError.badRequest('ציין התראה או סמן הכל');

  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', session.userId)
    .is('read_at', null);

  if (id) query = query.eq('id', id);

  const { error } = await query;
  if (error) throw ApiError.badRequest('עדכון ההתראות נכשל', error.message);

  return jsonOk({ updated: true });
});
