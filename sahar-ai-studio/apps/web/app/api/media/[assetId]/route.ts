import { prisma } from '@sahar/db';
import { ObjectNotFoundError } from '@sahar/storage';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { ApiError, apiError, handleApiError, requireApiUser } from '@/lib/api';
import { logger } from '@/lib/logger';
import { parseSingleRange } from '@/lib/range';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Streams a private media object to its owner, with HTTP Range support (required by
 * Safari/iOS for audio and video playback). Storage is never exposed directly.
 * Not-owned and not-found are indistinguishable (404).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const user = await requireApiUser();
    const { assetId } = await params;
    const asset = await prisma.asset.findFirst({
      where: {
        id: assetId,
        ownerId: user.id,
        deletedAt: null,
        status: { in: ['READY', 'UPLOADED', 'VERIFYING'] },
      },
      select: { storageKey: true, mimeType: true, sha256: true, kind: true },
    });
    if (!asset) return apiError(404, 'notFound');

    const range = parseSingleRange(request.headers.get('range'));
    let object;
    try {
      object = await getStorage().get(asset.storageKey, range);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return apiError(404, 'notFound');
      if ((error as { name?: string }).name === 'InvalidRange') {
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */*' } });
      }
      throw error;
    }

    const headers = new Headers({
      'Content-Type': asset.mimeType,
      'Content-Length': String(object.contentLength),
      'Accept-Ranges': 'bytes',
      // Objects are immutable once uploaded, but private to the signed-in owner.
      'Cache-Control': 'private, max-age=86400',
      'Content-Disposition': 'inline',
    });
    if (asset.sha256) headers.set('ETag', `"${asset.sha256}"`);
    if (range && object.contentRange) headers.set('Content-Range', object.contentRange);

    const body = Readable.toWeb(object.body) as ReadableStream<Uint8Array>;
    return new Response(body, { status: range && object.contentRange ? 206 : 200, headers });
  } catch (error) {
    if (!(error instanceof ApiError)) logger.error({ err: error }, 'media stream failed');
    return handleApiError(error);
  }
}
