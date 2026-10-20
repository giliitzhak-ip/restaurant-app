import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@sahar/db';
import { createProviderRegistry } from '@sahar/providers';
import { createLogger } from '@sahar/shared/logger';
import { assetObjectKey, storageFromEnv } from '@sahar/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM helper shared with the e2e suite
import { ensureFixtures } from '../../../../scripts/fixtures.mjs';
import {
  failGeneration,
  PermanentGenerationError,
  processGeneration,
  type GenerationContext,
} from './generate';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must be set for integration tests');
const db = new PrismaClient({ datasourceUrl: url });
const storage = storageFromEnv({
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION ?? 'us-east-1',
  S3_BUCKET: process.env.S3_BUCKET ?? 'sahar-media',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== 'false',
});
const fixtures = ensureFixtures(path.join(tmpdir(), 'sahar-fixtures'));
const ctx: GenerationContext = {
  db,
  storage,
  log: createLogger('worker-test', 'silent'),
  providers: createProviderRegistry({ ffmpegPath: 'ffmpeg' }),
  ffprobePath: 'ffprobe',
  tmpRoot: tmpdir(),
  progressIntervalMs: 100,
};

let userId: string;
let projectId: string;
let sceneId: string;
let audioAssetId: string;
let referenceAssetId: string;

async function storedAsset(
  kind: 'AUDIO_MASTER' | 'IMAGE_REFERENCE',
  file: string,
  mimeType: string,
) {
  const bytes = await readFile(file);
  const asset = await db.asset.create({
    data: {
      ownerId: userId,
      kind,
      status: 'READY',
      bucket: storage.bucket,
      storageKey: `pending/${randomUUID()}`,
      originalFilename: path.basename(file),
      mimeType,
      sizeBytes: BigInt(bytes.length),
    },
  });
  const storageKey = assetObjectKey(userId, asset.id, `original${path.extname(file)}`);
  await storage.putBuffer(storageKey, bytes, mimeType);
  return db.asset.update({ where: { id: asset.id }, data: { storageKey } });
}

async function queuedJob(
  overrides: { startMs?: number; endMs?: number; referenceAssetId?: string | null } = {},
) {
  const startMs = overrides.startMs ?? 8_000;
  const endMs = overrides.endMs ?? 11_000;
  return db.generationJob.create({
    data: {
      ownerId: userId,
      projectId,
      sceneId,
      providerKey: 'mock',
      operation: 'AUDIO_TO_VIDEO',
      status: 'QUEUED',
      idempotencyKey: randomUUID(),
      approvedAt: new Date(),
      estimatedCostUsd: '0',
      inputSnapshot: {
        audioAssetId,
        referenceAssetId:
          overrides.referenceAssetId === undefined ? referenceAssetId : overrides.referenceAssetId,
        startMs,
        endMs,
        width: 1280,
        height: 720,
        fps: 30,
        prompt: '',
        label: 'Scene 1',
      },
    },
  });
}

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `gen-${Date.now()}@test.local`,
      name: 'Gen',
      passwordHash: 'scrypt$x',
      termsAcceptedAt: new Date(),
      termsVersion: 'test',
    },
  });
  userId = user.id;
  audioAssetId = (await storedAsset('AUDIO_MASTER', fixtures.songMp3, 'audio/mpeg')).id;
  referenceAssetId = (await storedAsset('IMAGE_REFERENCE', fixtures.referenceJpg, 'image/jpeg')).id;
  const project = await db.project.create({
    data: {
      ownerId: userId,
      title: 'Gen',
      masterAudioId: audioAssetId,
      outputWidth: 1280,
      outputHeight: 720,
    },
  });
  projectId = project.id;
  sceneId = (
    await db.scene.create({
      data: { projectId, position: 0, startMs: 8_000, endMs: 11_000, status: 'GENERATING' },
    })
  ).id;
});

afterAll(async () => {
  const assets = await db.asset.findMany({ where: { ownerId: userId } });
  await storage.delete(assets.map((a) => a.storageKey)).catch(() => undefined);
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe('processGeneration (real FFmpeg, S3 and PostgreSQL)', () => {
  it('renders, verifies and stores a take, then completes the job', async () => {
    const job = await queuedJob();
    await expect(processGeneration(ctx, job.id)).resolves.toBe('completed');

    const done = await db.generationJob.findUniqueOrThrow({
      where: { id: job.id },
      include: {
        take: { include: { videoAsset: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    expect(done).toMatchObject({ status: 'COMPLETED', progress: 1, attempts: 1 });
    expect(done.actualCostUsd?.toString()).toBe('0');
    expect(done.events.map((e) => e.toStatus)).toEqual(['PROCESSING', 'COMPLETED']);
    expect(done.take).toMatchObject({ takeNumber: 1, sceneId });
    const asset = done.take!.videoAsset!;
    expect(asset).toMatchObject({
      kind: 'VIDEO_TAKE',
      status: 'READY',
      mimeType: 'video/mp4',
      width: 1280,
      height: 720,
    });
    expect(Math.abs(asset.durationMs! - 3_000)).toBeLessThan(100);
    expect(asset.metadata).toMatchObject({ providerKey: 'mock', providerKind: 'technical-test' });

    // What is in storage is exactly what was verified.
    const object = await storage.get(asset.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
    expect(createHash('sha256').update(Buffer.concat(chunks)).digest('hex')).toBe(asset.sha256);

    const scene = await db.scene.findUniqueOrThrow({ where: { id: sceneId } });
    expect(scene).toMatchObject({ status: 'READY', selectedTakeId: done.take!.id });

    // A retried delivery of the same job does nothing.
    await expect(processGeneration(ctx, job.id)).resolves.toBe('skipped');
    expect(await db.take.count({ where: { sceneId } })).toBe(1);
  }, 60_000);

  it('adds further takes without changing the selected one', async () => {
    const first = await db.scene.findUniqueOrThrow({ where: { id: sceneId } });
    const job = await queuedJob({ referenceAssetId: null });
    await expect(processGeneration(ctx, job.id)).resolves.toBe('completed');
    const takes = await db.take.findMany({ where: { sceneId }, orderBy: { takeNumber: 'asc' } });
    expect(takes.map((t) => t.takeNumber)).toEqual([1, 2]);
    expect((await db.scene.findUniqueOrThrow({ where: { id: sceneId } })).selectedTakeId).toBe(
      first.selectedTakeId,
    );
  }, 60_000);

  it('fails permanently with a clear code when an input disappeared', async () => {
    const job = await queuedJob({ referenceAssetId: 'does-not-exist' });
    const error = await processGeneration(ctx, job.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentGenerationError);
    expect((error as PermanentGenerationError).code).toBe('reference_missing');
    await failGeneration(db, job.id, 'reference_missing', 'x');
    const failed = await db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed).toMatchObject({ status: 'FAILED', errorCode: 'reference_missing' });
    expect(failed.failedAt).not.toBeNull();
  }, 60_000);

  it('stops rendering when the job is cancelled, and stores nothing', async () => {
    const before = await db.take.count({ where: { sceneId } });
    const job = await queuedJob({ startMs: 0, endMs: 30_000 });
    const running = processGeneration(ctx, job.id);
    // Cancel as soon as real progress has been recorded.
    for (let i = 0; i < 200; i++) {
      const current = await db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      if ((current.progress ?? 0) > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await db.generationJob.update({
      where: { id: job.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await expect(running).resolves.toBe('cancelled');
    expect(await db.take.count({ where: { sceneId } })).toBe(before);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      'CANCELLED',
    );
  }, 60_000);

  it('does not run jobs that were cancelled while queued', async () => {
    const job = await queuedJob();
    await db.generationJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
    await expect(processGeneration(ctx, job.id)).resolves.toBe('skipped');
  });
});
