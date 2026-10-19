import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { validateImageProbe } from '@sahar/media';
import { ffprobe } from '../media/ffmpeg';
import { InvalidMediaError, type MediaContext } from './media-context';

/**
 * Confirms an uploaded reference image really is a JPEG/PNG/WebP still within size limits
 * and records its dimensions. The stored original is never modified.
 */
export async function verifyImage(
  ctx: MediaContext,
  assetId: string,
): Promise<'ready' | 'skipped'> {
  const asset = await ctx.db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.kind !== 'IMAGE_REFERENCE' || asset.deletedAt) return 'skipped';
  if (asset.status === 'READY' || asset.status === 'FAILED' || asset.status === 'DELETED')
    return 'skipped';

  await ctx.db.asset.update({ where: { id: assetId }, data: { status: 'VERIFYING' } });
  const dir = await mkdtemp(path.join(ctx.tmpRoot, 'img-'));
  try {
    const file = path.join(dir, 'source');
    await ctx.storage.downloadToFile(asset.storageKey, file);
    const verdict = validateImageProbe(await ffprobe(ctx.ffprobePath, file).catch(() => ({})));
    if (!verdict.ok) throw new InvalidMediaError(verdict.reason);

    await ctx.db.asset.update({
      where: { id: assetId },
      data: {
        status: 'READY',
        width: verdict.info.width,
        height: verdict.info.height,
        metadata: { codec: verdict.info.codec },
        failureReason: null,
      },
    });
    ctx.log.info(
      { assetId, width: verdict.info.width, height: verdict.info.height },
      'reference image verified',
    );
    return 'ready';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
