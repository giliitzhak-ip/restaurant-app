import { handleError } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { privateFileHeaders } from '@/domains/files/sniff';
import { getJobImage } from '@/domains/jobs/images';
import { newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Serve a job photo to the customer and the provider on that job, or an admin.
 *
 * No signed URL and no public address: the SELECT runs as the caller, so
 * `job_images_participant` is the authorization. Photos of the inside of
 * somebody's home are exactly as private as a licence scan.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; imageId: string }> },
) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const { id: jobId, imageId } = await context.params;

    const limit = await rateLimit(`job-image-file:${user.id}`, 120, 300);
    if (!limit.allowed) return new Response('Too many requests', { status: 429 });

    const file = await withUser(user.id, async (db) => {
      const row = await db.one<{ storage_path: string }>(
        'select storage_path from job_images where id = $1 and job_id = $2',
        [imageId, jobId],
      );
      if (!row || row.storage_path === '') return null;
      return getJobImage(db, row.storage_path);
    });

    // The same answer whether it does not exist or belongs to somebody else's
    // job, so the response cannot be used to enumerate.
    if (!file) return new Response('Not found', { status: 404 });

    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: privateFileHeaders(file.contentType),
    });
  } catch (error) {
    return handleError(error, 'jobs.images.read', requestId);
  }
}
