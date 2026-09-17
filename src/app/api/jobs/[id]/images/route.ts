import { z } from 'zod';
import { ApiError, fail, handleError, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { isImageType, MAX_UPLOAD_BYTES, sniffFileType } from '@/domains/files/sniff';
import { JOB_IMAGE_KINDS, missingJobImages, putJobImage } from '@/domains/jobs/images';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Photos of a job, taken by the people on it.
 *
 * Authorization is RLS throughout: `job_images_insert_participant` accepts a
 * row only when `uploaded_by = auth.uid()` and the caller is a participant of
 * that job, and `job_images_participant` shows a row only to a participant or
 * an admin. There is no ownership check in this file, because there must not
 * be two answers to the same question.
 */

const KINDS = ['problem', 'before', 'after', 'receipt'] as const;

const metaSchema = z.object({ kind: z.enum(KINDS) });

/** Enough to document a job; more than that is somebody using us as storage. */
const MAX_IMAGES_PER_JOB = 12;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const { id: jobId } = await context.params;

    const data = await withUser(user.id, async (db) => {
      // No storage_path: the locator is not the client's business, and the
      // file is fetched by id.
      const images = await db.many(
        `select i.id, i.kind, i.content_type, i.size_bytes, i.created_at,
                i.uploaded_by, p.full_name as uploaded_by_name
           from job_images i
           join profiles p on p.id = i.uploaded_by
          where i.job_id = $1
          order by i.created_at`,
        [jobId],
      );
      // An empty list from RLS is indistinguishable from a job with no
      // photos, which is the correct answer to give a stranger either way.
      const missing = await missingJobImages(db, jobId);
      return { images, missing };
    });

    return ok({ ...data, kinds: JOB_IMAGE_KINDS, maxBytes: MAX_UPLOAD_BYTES });
  } catch (error) {
    return handleError(error, 'jobs.images.list', requestId);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const { id: jobId } = await context.params;

    const limit = await rateLimit(`job-images:${user.id}`, 40, 3600);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'הועלו יותר מדי תמונות. נסו בעוד שעה.', 429, requestId);
    }

    const form = await request.formData().catch(() => null);
    if (!form) throw new ApiError('INVALID_BODY', 'הבקשה אינה טופס תקין', 400);

    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError('FILE_REQUIRED', 'לא נבחר קובץ', 422);
    if (file.size === 0) throw new ApiError('FILE_EMPTY', 'הקובץ ריק', 422);
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'הקובץ גדול מ-10MB', 413);
    }

    const meta = metaSchema.safeParse({ kind: form.get('kind') ?? undefined });
    if (!meta.success) throw new ApiError('VALIDATION_FAILED', 'סוג התמונה חסר', 422);

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = sniffFileType(bytes);
    // A picture, and identified from its own bytes rather than from what the
    // browser claimed — a job photo has no business being a PDF, and an HTML
    // file labelled image/png would run in the customer's session.
    if (!isImageType(contentType)) {
      throw new ApiError('UNSUPPORTED_FILE', 'אפשר להעלות תמונה בפורמט JPG, PNG או WEBP', 415);
    }

    const created = await withUser(user.id, async (db) => {
      const count = await db.one<{ n: string }>(
        'select count(*)::text as n from job_images where job_id = $1',
        [jobId],
      );
      if (Number(count?.n ?? 0) >= MAX_IMAGES_PER_JOB) {
        throw new ApiError('TOO_MANY_IMAGES', 'הגעתם למספר התמונות המקסימלי לעבודה', 409);
      }

      const stored = await putJobImage(db, {
        jobId,
        uploadedBy: user.id,
        kind: meta.data.kind,
        bytes,
        contentType: contentType!,
      });
      const missing = await missingJobImages(db, jobId);
      return { ...stored, missing };
    });

    logOperation({
      requestId, userId: user.id, jobId,
      operation: 'jobs.images.upload', result: 'ok',
      meta: { kind: meta.data.kind, contentType, sizeBytes: created.sizeBytes },
    });

    return ok(
      { id: created.id, kind: meta.data.kind, stillMissing: created.missing },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error, 'jobs.images.upload', requestId);
  }
}

const deleteSchema = z.object({ imageId: z.uuid() });

/** Remove a photo you took, while the job is still open. RLS enforces both. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const { id: jobId } = await context.params;
    const parsed = deleteSchema.safeParse({
      imageId: new URL(request.url).searchParams.get('imageId') ?? undefined,
    });
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'מזהה תמונה חסר', 422);

    const removed = await withUser(user.id, (db) =>
      db.one<{ id: string }>(
        // The job predicate is here only to scope the row to this URL; the
        // ownership and the "job still open" rules are both in the policy.
        'delete from job_images where id = $1 and job_id = $2 returning id',
        [parsed.data.imageId, jobId],
      ),
    );
    if (!removed) {
      throw new ApiError('NOT_FOUND', 'התמונה לא נמצאה, או שהעבודה נסגרה', 404);
    }

    return ok({ id: removed.id, removed: true });
  } catch (error) {
    return handleError(error, 'jobs.images.delete', requestId);
  }
}
