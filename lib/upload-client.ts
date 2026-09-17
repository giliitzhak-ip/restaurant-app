'use client';

import { getBrowserSupabase } from '@/lib/supabase/client';

export type UploadBucket =
  | 'avatars'
  | 'provider-gallery'
  | 'job-media'
  | 'chat-media'
  | 'provider-documents';

export interface UploadedFile {
  bucket: UploadBucket;
  path: string;
  /** Public URL when the bucket is public; null for private buckets. */
  publicUrl: string | null;
  name: string;
  size: number;
  type: string;
}

const MAX_SIZES: Record<UploadBucket, number> = {
  avatars: 5 * 1024 * 1024,
  'provider-gallery': 10 * 1024 * 1024,
  'job-media': 50 * 1024 * 1024,
  'chat-media': 10 * 1024 * 1024,
  'provider-documents': 20 * 1024 * 1024,
};

/**
 * Uploads a file straight from the browser to Supabase Storage.
 *
 * The server only mints a one-time signed URL (and owns the path convention);
 * the bytes never pass through our API routes.
 */
export async function uploadFile(bucket: UploadBucket, file: File): Promise<UploadedFile> {
  if (file.size > MAX_SIZES[bucket]) {
    throw new Error(`הקובץ גדול מדי (מקסימום ${Math.round(MAX_SIZES[bucket] / 1024 / 1024)}MB)`);
  }

  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error('העלאת קבצים דורשת חיבור Supabase');

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, fileName: file.name, contentType: file.type }),
  });

  const payload = (await response.json()) as
    | { ok: true; data: { bucket: UploadBucket; path: string; token: string } }
    | { ok: false; error: { message: string } };

  if (!payload.ok) throw new Error(payload.error.message);

  const { error } = await supabase.storage
    .from(payload.data.bucket)
    .uploadToSignedUrl(payload.data.path, payload.data.token, file);

  if (error) throw new Error('העלאת הקובץ נכשלה');

  const isPublic = bucket === 'avatars' || bucket === 'provider-gallery';
  const publicUrl = isPublic
    ? supabase.storage.from(bucket).getPublicUrl(payload.data.path).data.publicUrl
    : null;

  return {
    bucket,
    path: payload.data.path,
    publicUrl,
    name: file.name,
    size: file.size,
    type: file.type,
  };
}

/** Short-lived URL for a private object (job photos, chat images, documents). */
export async function signedUrlFor(
  bucket: UploadBucket,
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}
