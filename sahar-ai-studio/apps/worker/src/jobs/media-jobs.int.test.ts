import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@sahar/db';
import { createLogger } from '@sahar/shared/logger';
import { assetObjectKey, storageFromEnv } from '@sahar/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM helper shared with the e2e suite
import { ensureFixtures, FIXTURE_FACTS } from '../../../../scripts/fixtures.mjs';
import { analyzeAudio } from './analyze-audio';
import { InvalidMediaError, type MediaContext } from './media-context';
import { verifyImage } from './verify-image';

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
const ctx: MediaContext = {
  db,
  storage,
  log: createLogger('worker-test', 'silent'),
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  tmpRoot: tmpdir(),
};
const fixtures = ensureFixtures(path.join(tmpdir(), 'sahar-fixtures'));

let userId: string;
let projectId: string;
let characterId: string;
let primaryRefId: string;

async function uploadAsset(
  kind: 'AUDIO_MASTER' | 'IMAGE_REFERENCE',
  file: string,
  mimeType: string,
  withProject = true,
) {
  const asset = await db.asset.create({
    data: {
      ownerId: userId,
      projectId: withProject ? projectId : null,
      kind,
      status: 'UPLOADED',
      bucket: storage.bucket,
      storageKey: `pending-${Math.random()}`,
      originalFilename: path.basename(file),
      mimeType,
      sizeBytes: BigInt((await readFile(file)).length),
    },
  });
  const storageKey = assetObjectKey(userId, asset.id, `original${path.extname(file)}`);
  await storage.putBuffer(storageKey, await readFile(file), mimeType);
  return db.asset.update({ where: { id: asset.id }, data: { storageKey } });
}

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `media-${Date.now()}@test.local`,
      name: 'Media Test',
      passwordHash: 'scrypt$x',
      termsAcceptedAt: new Date(),
      termsVersion: 'test',
    },
  });
  userId = user.id;
  const character = await db.character.create({
    data: { ownerId: userId, name: 'Sharona Sahar', presetKey: 'sharona-sahar' },
  });
  characterId = character.id;
  const project = await db.project.create({
    data: { ownerId: userId, title: 'Test song', mainCharacterId: characterId },
  });
  projectId = project.id;
});

afterAll(async () => {
  const assets = await db.asset.findMany({ where: { ownerId: userId } });
  await storage.delete(assets.map((a) => a.storageKey)).catch(() => undefined);
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe('verifyImage (real ffprobe + S3)', () => {
  it('marks a valid reference image READY with its dimensions', async () => {
    const asset = await uploadAsset('IMAGE_REFERENCE', fixtures.referencePng, 'image/png', false);
    const ref = await db.characterReferenceImage.create({
      data: { characterId, assetId: asset.id, isPrimary: true },
    });
    primaryRefId = ref.id;
    await expect(verifyImage(ctx, asset.id)).resolves.toBe('ready');
    const saved = await db.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(saved).toMatchObject({ status: 'READY', width: 600, height: 800 });
    // Idempotent: a retried job does nothing.
    await expect(verifyImage(ctx, asset.id)).resolves.toBe('skipped');
  });

  it('rejects images below the minimum size', async () => {
    const asset = await uploadAsset('IMAGE_REFERENCE', fixtures.tinyPng, 'image/png', false);
    await expect(verifyImage(ctx, asset.id)).rejects.toBeInstanceOf(InvalidMediaError);
  });
});

describe('analyzeAudio (real ffmpeg + S3)', () => {
  it('analyzes the song, stores a waveform and proposes scenes with the main character', async () => {
    const asset = await uploadAsset('AUDIO_MASTER', fixtures.songMp3, 'audio/mpeg');
    await db.project.update({ where: { id: projectId }, data: { masterAudioId: asset.id } });
    const originalBytes = await readFile(fixtures.songMp3);

    await expect(analyzeAudio(ctx, asset.id)).resolves.toBe('ready');

    const analysis = await db.audioAnalysis.findUniqueOrThrow({
      where: { assetId: asset.id },
      include: { waveformAsset: true },
    });
    expect(Math.abs(analysis.durationMs - FIXTURE_FACTS.durationMs)).toBeLessThan(100);
    expect(analysis).toMatchObject({ sampleRate: 44100, channels: 2, codec: 'mp3' });

    // The known gap is found.
    const silences = analysis.silenceRegions as { startMs: number; endMs: number }[];
    const gap = silences.find((s) => s.startMs > 8_000 && s.endMs < 14_000);
    expect(gap).toBeDefined();
    expect(Math.abs(gap!.startMs - FIXTURE_FACTS.silence.startMs)).toBeLessThan(100);
    expect(Math.abs(gap!.endMs - FIXTURE_FACTS.silence.endMs)).toBeLessThan(100);

    expect(analysis.tempoBpm).not.toBeNull();
    expect(Math.abs(analysis.tempoBpm! - FIXTURE_FACTS.bpm)).toBeLessThanOrEqual(1.5);
    expect((analysis.beatTimesMs as number[]).length).toBeGreaterThan(40);

    const waveform = JSON.parse(
      await new Response(
        (await storage.get(analysis.waveformAsset!.storageKey)).body as never,
      ).text(),
    );
    expect(waveform.peaksPerSecond).toBeCloseTo(100, 0);
    expect(waveform.peaks.length).toBeGreaterThan(2900);
    // Silent stretch is flat, clicks are loud.
    expect(Math.max(...waveform.peaks.slice(1050, 1150))).toBeLessThan(5);
    expect(Math.max(...waveform.peaks.slice(0, 100))).toBeGreaterThan(150);

    const scenes = await db.scene.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes[0]!.startMs).toBe(0);
    expect(scenes.at(-1)!.endMs).toBe(analysis.durationMs);
    // Identity consistency: every scene uses the main character and its primary image.
    for (const scene of scenes) {
      expect(scene.characterId).toBe(characterId);
      expect(scene.referenceImageId).toBe(primaryRefId);
    }
    // A boundary falls inside the silence.
    expect(
      scenes.some(
        (s) => s.endMs > FIXTURE_FACTS.silence.startMs && s.endMs < FIXTURE_FACTS.silence.endMs,
      ),
    ).toBe(true);

    // The original upload is untouched.
    const stored = await storage.get(asset.storageKey);
    expect(stored.contentLength).toBe(originalBytes.length);
  }, 60_000);

  it('rejects files that look like MP3 but do not decode', async () => {
    const asset = await uploadAsset('AUDIO_MASTER', fixtures.corruptMp3, 'audio/mpeg', false);
    await expect(analyzeAudio(ctx, asset.id)).rejects.toBeInstanceOf(InvalidMediaError);
  });
});
