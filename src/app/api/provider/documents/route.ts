import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, fail, handleError, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import {
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  getDocumentStorage,
  sniffDocumentType,
  type DocumentKind,
} from '@/domains/documents';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * A provider submitting the papers their trade requires (spec §31).
 *
 * The registration form has always said "התחום הזה דורש רישיון וביטוח. המנהל
 * יבקש את המסמכים לפני האימות" and then offered nowhere to put them. The
 * table and its row security shipped in migrations 0007 and 0011; nothing
 * ever wrote to it, so the sentence on the form was a promise the product did
 * not keep, and `verify_provider` could mark a licensed trade VERIFIED with
 * no licence anywhere in the system.
 *
 * Authorization is RLS, not a check here: a provider may insert only rows
 * where `provider_id = auth.uid()`, may delete only their own PENDING ones,
 * and has no UPDATE policy at all — so nobody approves their own licence.
 */

/** The kinds a provider may submit for themselves. */
const SUBMITTABLE = ['license', 'insurance', 'identity', 'business_registration', 'payout', 'other'] as const;

const metaSchema = z.object({
  docType: z.enum(SUBMITTABLE),
  /** Licence or policy number, as printed on the document. */
  docNumber: z.string().trim().min(2).max(60).optional(),
  /** ISO date. Absent means the document states no expiry. */
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * One pending document per kind. A reviewer looking at four copies of the
 * same licence is a queue nobody works through, and "which of these is
 * current?" is a question the provider should answer by withdrawing rather
 * than by uploading again.
 */
const MAX_PENDING_PER_KIND = 1;

export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');

    const data = await withUser(user.id, async (db) => {
      // Never the bytes, and never storage_path: the list is metadata, and
      // the locator is not a client's business.
      const documents = await db.many(
        /*
         * `expires_on` is a DATE, and it goes out as text.
         *
         * Left as a date, node-postgres hands back a JS Date at local
         * midnight and JSON turns it into "2028-06-30T00:00:00.000Z" — a
         * timestamp the document does not have, which the screen then
         * printed in full and which lands on the previous day for any viewer
         * west of UTC. A date with no time is exactly what to_char returns.
         */
        `select id, doc_type, doc_number, original_filename, content_type,
                size_bytes, status::text as status,
                to_char(expires_on, 'YYYY-MM-DD') as expires_on,
                review_notes, created_at, reviewed_at
           from provider_documents
          where provider_id = $1
          order by created_at desc
          limit 40`,
        [user.id],
      );

      const missing = await db.one<{ missing: string[] }>(
        'select provider_missing_documents($1) as missing',
        [user.id],
      );

      return { documents, missing: missing?.missing ?? [] };
    });

    return ok({ ...data, kinds: DOCUMENT_KINDS, maxBytes: MAX_DOCUMENT_BYTES });
  } catch (error) {
    return handleError(error, 'provider.documents.list', requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');

    const limit = await rateLimit(`documents:${user.id}`, 20, 3600);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'הועלו יותר מדי מסמכים. נסו בעוד שעה.', 429, requestId);
    }

    const form = await request.formData().catch(() => null);
    if (!form) throw new ApiError('INVALID_BODY', 'הבקשה אינה טופס תקין', 400);

    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new ApiError('FILE_REQUIRED', 'לא נבחר קובץ', 422);
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'הקובץ גדול מ-10MB', 413);
    }
    if (file.size === 0) {
      throw new ApiError('FILE_EMPTY', 'הקובץ ריק', 422);
    }

    const meta = metaSchema.safeParse({
      docType: form.get('docType') ?? undefined,
      docNumber: form.get('docNumber') || undefined,
      expiresOn: form.get('expiresOn') || undefined,
    });
    if (!meta.success) {
      throw new ApiError('VALIDATION_FAILED', 'הפרטים שנשלחו אינם תקינים', 422, {
        issue: meta.error.issues[0]?.message ?? 'unknown',
      });
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    /*
     * The type comes from the file's own leading bytes, never from the
     * Content-Type the browser sent. A provider could otherwise upload an
     * HTML file labelled image/png; served back to a reviewer from our own
     * origin that is script execution inside a session which can verify
     * providers and read every document in the queue.
     */
    const contentType = sniffDocumentType(bytes);
    if (!contentType) {
      throw new ApiError(
        'UNSUPPORTED_FILE',
        'אפשר להעלות PDF, JPG, PNG או WEBP בלבד',
        415,
      );
    }

    // An expiry already past is not a valid document, and accepting one means
    // a reviewer approving something expired.
    if (meta.data.expiresOn) {
      const today = new Date().toISOString().slice(0, 10);
      if (meta.data.expiresOn < today) {
        throw new ApiError('DOCUMENT_EXPIRED', 'תוקף המסמך פג — יש להעלות מסמך בתוקף', 422);
      }
    }

    const created = await withUser(user.id, async (db) => {
      const pending = await db.one<{ n: string }>(
        `select count(*)::text as n from provider_documents
          where provider_id = $1 and doc_type = $2 and status = 'PENDING'`,
        [user.id, meta.data.docType],
      );
      if (Number(pending?.n ?? 0) >= MAX_PENDING_PER_KIND) {
        throw new ApiError(
          'ALREADY_PENDING',
          'מסמך מהסוג הזה כבר ממתין לבדיקה. אפשר להסיר אותו ולהעלות אחר.',
          409,
        );
      }

      /*
       * The id and the locator are decided here, before the INSERT, and both
       * go in with it.
       *
       * `provider_documents` has no owner UPDATE policy — that is what stops
       * a provider approving their own licence — so a provider cannot come
       * back and patch `storage_path` onto a row they just inserted. An
       * earlier version did exactly that: the insert succeeded, the update
       * silently matched no row, and every uploaded document was stored with
       * an empty path and could never be read back. Caught by a test that
       * asserted the path, not by anything the upload itself reported.
       */
      const storage = getDocumentStorage();
      const documentId = randomUUID();
      const storagePath = storage.locate(documentId);

      const row = await db.one<{ id: string }>(
        `insert into provider_documents
           (id, provider_id, doc_type, storage_path, content_type, size_bytes,
            expires_on, doc_number, original_filename)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id`,
        [
          documentId,
          user.id,
          meta.data.docType,
          storagePath,
          contentType,
          bytes.length,
          meta.data.expiresOn ?? null,
          meta.data.docNumber ?? null,
          // A filename is attacker-controlled text that a reviewer reads.
          // Stored for recognition only, never used as a path.
          file.name.slice(0, 200) || null,
        ],
      );
      if (!row) throw new Error('Document insert returned no row');

      // Same transaction as the row: a row with no file is an empty promise
      // in the reviewer's queue, and orphaned bytes are a private file nobody
      // can account for.
      const stored = await storage.put(db, {
        documentId,
        storagePath,
        bytes,
        contentType,
      });

      return { id: row.id, sizeBytes: stored.sizeBytes };
    });

    logOperation({
      requestId, userId: user.id, providerId: user.id,
      operation: 'provider.documents.upload', result: 'ok',
      // Deliberately no filename, no document number and no bytes: a log line
      // is the one place this data must not end up.
      meta: { docType: meta.data.docType, contentType, sizeBytes: created.sizeBytes },
    });

    return ok(
      {
        id: created.id,
        docType: meta.data.docType,
        status: 'PENDING',
        message: 'המסמך נשלח לבדיקה. האימות יתבצע אחרי שהמנהל יאשר אותו.',
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error, 'provider.documents.upload', requestId);
  }
}

const deleteSchema = z.object({ id: z.uuid() });

/** Withdraw a document that has not been reviewed. RLS enforces both halves. */
export async function DELETE(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const parsed = deleteSchema.safeParse({
      id: new URL(request.url).searchParams.get('id') ?? undefined,
    });
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'מזהה מסמך חסר', 422);

    const removed = await withUser(user.id, (db) =>
      db.one<{ id: string }>(
        // No status or ownership predicate here on purpose: the DELETE policy
        // carries both, so this returns nothing for someone else's document
        // and nothing for one already reviewed.
        'delete from provider_documents where id = $1 returning id',
        [parsed.data.id],
      ),
    );
    if (!removed) {
      throw new ApiError(
        'NOT_FOUND',
        'המסמך לא נמצא, או שכבר נבדק ולא ניתן להסיר אותו',
        404,
      );
    }

    return ok({ id: removed.id, removed: true });
  } catch (error) {
    return handleError(error, 'provider.documents.delete', requestId);
  }
}

export type { DocumentKind };
