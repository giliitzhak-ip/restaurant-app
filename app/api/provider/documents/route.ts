import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider } from '@/lib/api/guards';
import { providerDocumentSchema } from '@/lib/validation/providers';

/**
 * Verification documents.
 *
 * Only metadata passes through here — the file itself is uploaded straight to
 * the private `provider-documents` bucket, whose storage policy allows reads
 * for the owner and admins only. The list below never exposes another
 * provider's documents, and customers cannot reach this route at all.
 */
export const GET = route(async () => {
  const { supabase, providerId } = await requireProvider();

  const { data, error } = await supabase
    .from('provider_documents')
    .select('id, doc_type, file_name, status, review_note, expires_at, created_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });

  if (error) throw ApiError.badRequest('לא ניתן לטעון מסמכים', error.message);
  return jsonOk({ documents: data ?? [] });
});

export const POST = route(async (request: NextRequest) => {
  const { session, supabase, providerId } = await requireProvider();
  const input = await parseBody(request, providerDocumentSchema);

  // Path convention: <user_id>/<file>. Reject anything else so a provider
  // cannot register a row pointing at somebody else's object.
  if (!input.storagePath.startsWith(`${session.userId}/`)) {
    throw ApiError.badRequest('נתיב הקובץ אינו תקין');
  }

  const { data, error } = await supabase
    .from('provider_documents')
    .insert({
      provider_id: providerId,
      doc_type: input.docType,
      storage_path: input.storagePath,
      file_name: input.fileName ?? null,
      expires_at: input.expiresAt ?? null,
      status: 'pending',
    })
    .select('id, doc_type, file_name, status, created_at')
    .single();

  if (error || !data) throw ApiError.badRequest('שמירת המסמך נכשלה', error?.message);
  return jsonOk({ document: data }, 201);
});
