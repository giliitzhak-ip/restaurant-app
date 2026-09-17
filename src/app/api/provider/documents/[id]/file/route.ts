import { handleError } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { getDocumentStorage } from '@/domains/documents';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Serve a provider document to the provider who submitted it, or to an admin.
 *
 * There is no signed URL and no public address, by design — see the
 * DocumentStorage interface. Every read goes through this handler, which
 * means every read goes through RLS: the SELECT below runs as the caller, and
 * `provider_documents_own` returns the row only for its owner or an admin.
 * There is no ownership check in this file because there must not be two
 * answers to the same question.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const { id } = await context.params;

    // Documents are identity papers. A loop over ids from any authenticated
    // session should cost something even though RLS already denies it.
    const limit = rateLimit(`document-file:${user.id}`, 60, 300);
    if (!limit.allowed) {
      return new Response('Too many requests', { status: 429 });
    }

    const found = await withUser(user.id, async (db) => {
      const row = await db.one<{
        storage_path: string; content_type: string | null;
        original_filename: string | null; provider_id: string;
      }>(
        `select storage_path, content_type, original_filename, provider_id
           from provider_documents where id = $1`,
        [id],
      );
      if (!row || row.storage_path === '') return null;

      const file = await getDocumentStorage().get(db, row.storage_path);
      if (!file) return null;
      return { row, file };
    });

    if (!found) {
      // The same answer whether the document does not exist or belongs to
      // somebody else, so the response cannot be used to enumerate.
      return new Response('Not found', { status: 404 });
    }

    logOperation({
      requestId, userId: user.id,
      operation: 'provider.documents.read', result: 'ok',
      meta: { documentId: id, own: found.row.provider_id === user.id },
    });

    /*
     * Served as an attachment, with sniffing switched off and a locked-down
     * CSP.
     *
     * The stored content type was established from the file's own magic bytes
     * at upload, so it cannot be a lie — but defence in depth matters here
     * because the audience for these files is an admin session that can
     * verify providers. `attachment` stops the browser rendering it in our
     * origin at all; `nosniff` stops it second-guessing the type; the CSP
     * neutralises anything a future format change might smuggle in.
     */
    return new Response(new Uint8Array(found.file.bytes), {
      status: 200,
      headers: {
        'Content-Type': found.file.contentType,
        'Content-Disposition': 'attachment',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Referrer-Policy': 'no-referrer',
        // Private, and never in a shared cache.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleError(error, 'provider.documents.read', requestId);
  }
}
