import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api';
import type { DbSession } from '@/lib/db';

/**
 * Job photos (spec §31, and `categories.requires_before_after` since 0004).
 *
 * The schema described these from the start and the UI told both sides they
 * were part of the work; nothing ever wrote one. Same shape as the licence
 * problem, and the same fix: store them, serve them only to the people on the
 * job, and make the requirement refuse rather than remind.
 */

export const JOB_IMAGE_KINDS = {
  problem: 'תיאור התקלה',
  before: 'לפני העבודה',
  after: 'אחרי העבודה',
  receipt: 'קבלה',
} as const;

export type JobImageKind = keyof typeof JOB_IMAGE_KINDS;

/** The locator, for the reasons in DocumentStorage: opaque, unguessable. */
export function locateJobImage(imageId: string): string {
  return `db://job-image/${imageId}/${randomUUID()}`;
}

function parseLocator(storagePath: string): string | null {
  const match = /^db:\/\/job-image\/([0-9a-f-]{36})\//.exec(storagePath);
  return match ? match[1]! : null;
}

export interface StoredJobImage {
  id: string;
  storagePath: string;
  sizeBytes: number;
}

/**
 * Write the row and its bytes together.
 *
 * The id and the locator are decided before the INSERT and go in with it,
 * because `job_images` has no UPDATE policy at all — the same trap that made
 * every uploaded document unreadable until a test caught it. There is nothing
 * to patch afterwards, so there is nothing to fail silently.
 */
export async function putJobImage(
  db: DbSession,
  input: {
    jobId: string;
    uploadedBy: string;
    kind: JobImageKind;
    bytes: Buffer;
    contentType: string;
  },
): Promise<StoredJobImage> {
  const id = randomUUID();
  const storagePath = locateJobImage(id);

  const row = await db.one<{ id: string }>(
    `insert into job_images
       (id, job_id, uploaded_by, storage_path, kind, content_type, size_bytes)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [id, input.jobId, input.uploadedBy, storagePath, input.kind, input.contentType, input.bytes.length],
  );
  if (!row) throw new Error('Job image insert returned no row');

  await db.query('insert into job_image_blobs (image_id, bytes) values ($1, $2)', [
    id,
    input.bytes,
  ]);

  return { id, storagePath, sizeBytes: input.bytes.length };
}

export interface FetchedJobImage {
  bytes: Buffer;
  contentType: string;
}

export async function getJobImage(
  db: DbSession,
  storagePath: string,
): Promise<FetchedJobImage | null> {
  const imageId = parseLocator(storagePath);
  if (!imageId) return null;

  const row = await db.one<{ bytes: Buffer; content_type: string | null }>(
    `select b.bytes, i.content_type
       from job_image_blobs b
       join job_images i on i.id = b.image_id
      where b.image_id = $1`,
    [imageId],
  );
  if (!row) return null;

  return {
    bytes: row.bytes,
    // Never the uploader's claim: the stored type came from the file's own
    // leading bytes, and an unrecognisable row is served as opaque binary.
    contentType: row.content_type ?? 'application/octet-stream',
  };
}

/** Which required photos the job has not got. One source, shared with the gate. */
export async function missingJobImages(db: DbSession, jobId: string): Promise<string[]> {
  const row = await db.one<{ missing: string[] }>('select job_missing_images($1) as missing', [
    jobId,
  ]);
  return row?.missing ?? [];
}

/**
 * Refuse to finish a job whose category asked to have it documented.
 *
 * A reminder would be the softer choice and the wrong one: the photos exist
 * for the dispute that happens weeks later, and by then nobody can go back
 * and take them. If the platform asks for evidence and then accepts a
 * completion without it, it is holding an empty file at exactly the moment
 * the file is the point.
 */
export async function assertJobImagesComplete(db: DbSession, jobId: string): Promise<void> {
  const missing = await missingJobImages(db, jobId);
  if (missing.length === 0) return;

  throw new ApiError(
    'PHOTOS_REQUIRED',
    `התחום הזה דורש תיעוד בתמונות. חסר: ${missing
      .map((kind) => JOB_IMAGE_KINDS[kind as JobImageKind] ?? kind)
      .join(', ')}`,
    409,
    { missing },
  );
}
