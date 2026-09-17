import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/api/guards';

const BUCKETS = ['avatars', 'provider-gallery', 'job-media', 'chat-media', 'provider-documents'] as const;

const schema = z.object({
  bucket: z.enum(BUCKETS),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(120).optional(),
});

const ALLOWED_EXTENSIONS = /\.(png|jpe?g|webp|gif|mp4|mov|pdf)$/i;

/**
 * POST /api/upload — issues a signed upload URL.
 *
 * The browser uploads straight to Supabase Storage; the file never passes
 * through this server. The path is always `<user_id>/<uuid><ext>`, which is
 * what the storage policies key ownership on — a client cannot choose a path
 * under somebody else's folder.
 */
export const POST = route(async (request: NextRequest) => {
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, schema);

  if (input.bucket === 'provider-documents' && session.role !== 'provider') {
    throw ApiError.forbidden('רק בעלי מקצוע יכולים להעלות מסמכי אימות');
  }

  if (!ALLOWED_EXTENSIONS.test(input.fileName)) {
    throw ApiError.badRequest('סוג הקובץ אינו נתמך');
  }

  const extension = input.fileName.slice(input.fileName.lastIndexOf('.')).toLowerCase();
  const path = `${session.userId}/${crypto.randomUUID()}${extension}`;

  const { data, error } = await supabase.storage.from(input.bucket).createSignedUploadUrl(path);

  if (error || !data) {
    throw ApiError.badRequest('לא ניתן ליצור קישור העלאה', error?.message);
  }

  return jsonOk({
    bucket: input.bucket,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
});
