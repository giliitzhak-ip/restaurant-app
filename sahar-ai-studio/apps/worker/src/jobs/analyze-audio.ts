import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  estimateTempo,
  parseSilenceDetect,
  PeakAccumulator,
  proposeScenes,
  TEMPO_ANALYZER,
  validateAudioProbe,
} from '@sahar/media';
import { decodeMonoPcm, ffprobe } from '../media/ffmpeg';
import { FloatBuffer } from '../media/float-buffer';
import { createInitialScenes } from './initial-scenes';
import { InvalidMediaError, type MediaContext } from './media-context';

export const ANALYZER_VERSION = 'sahar-audio-1';
const ANALYSIS_SAMPLE_RATE = 11_025;

/**
 * Verifies an uploaded song and derives everything the editor needs: technical facts
 * (ffprobe), a waveform, silence regions and — only when reliable — tempo and beats.
 * The uploaded file itself is only read, never rewritten.
 */
export async function analyzeAudio(
  ctx: MediaContext,
  assetId: string,
): Promise<'ready' | 'skipped'> {
  const asset = await ctx.db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.kind !== 'AUDIO_MASTER' || asset.deletedAt) return 'skipped';
  if (asset.status === 'READY' || asset.status === 'FAILED' || asset.status === 'DELETED')
    return 'skipped';

  await ctx.db.asset.update({ where: { id: assetId }, data: { status: 'VERIFYING' } });
  const dir = await mkdtemp(path.join(ctx.tmpRoot, 'audio-'));
  try {
    const file = path.join(dir, 'source');
    await ctx.storage.downloadToFile(asset.storageKey, file);

    const verdict = validateAudioProbe(await ffprobe(ctx.ffprobePath, file).catch(() => ({})));
    if (!verdict.ok) throw new InvalidMediaError(verdict.reason);
    const info = verdict.info;

    const peaks = new PeakAccumulator(ANALYSIS_SAMPLE_RATE, 100);
    const samples = new FloatBuffer(ANALYSIS_SAMPLE_RATE * Math.ceil(info.durationMs / 1000 + 1));
    const started = Date.now();
    const { log } = await decodeMonoPcm(ctx.ffmpegPath, file, ANALYSIS_SAMPLE_RATE, (chunk) => {
      peaks.push(chunk);
      samples.pushInt16(chunk);
    });
    const waveform = peaks.finish();
    const silences = parseSilenceDetect(log, info.durationMs);
    const tempo = estimateTempo(samples.view(), ANALYSIS_SAMPLE_RATE);
    const reliable = tempo !== null && tempo.confidence >= TEMPO_ANALYZER.reliableConfidence;

    const waveformKey = asset.storageKey.replace(/[^/]+$/, 'waveform.json');
    await ctx.storage.putBuffer(
      waveformKey,
      Buffer.from(JSON.stringify(waveform)),
      'application/json',
    );

    const spans = proposeScenes(info.durationMs, silences, reliable ? tempo.beatTimesMs : null);

    const sceneCount = await ctx.db.$transaction(async (tx) => {
      const waveformAsset = await tx.asset.upsert({
        where: { storageKey: waveformKey },
        create: {
          ownerId: asset.ownerId,
          projectId: asset.projectId,
          kind: 'WAVEFORM_PEAKS',
          status: 'READY',
          bucket: asset.bucket,
          storageKey: waveformKey,
          originalFilename: 'waveform.json',
          mimeType: 'application/json',
          sizeBytes: BigInt(Buffer.byteLength(JSON.stringify(waveform))),
          durationMs: info.durationMs,
        },
        update: {},
      });
      const analysis = {
        durationMs: info.durationMs,
        sampleRate: info.sampleRate,
        channels: info.channels,
        codec: info.codec,
        bitRate: info.bitRate,
        silenceRegions: silences.map(({ startMs, endMs }) => ({ startMs, endMs })),
        waveformAssetId: waveformAsset.id,
        tempoConfidence: tempo?.confidence ?? null,
        tempoBpm: reliable ? tempo.bpm : null,
        tempoAlternativeBpm: reliable ? tempo.alternativeBpm : null,
        beatTimesMs: reliable ? tempo.beatTimesMs : undefined,
        analyzerVersion: ANALYZER_VERSION,
      };
      await tx.audioAnalysis.upsert({
        where: { assetId },
        create: { assetId, ...analysis },
        update: analysis,
      });
      await tx.asset.update({
        where: { id: assetId },
        data: { status: 'READY', durationMs: info.durationMs, failureReason: null },
      });
      return asset.projectId ? createInitialScenes(tx, asset.projectId, spans) : 0;
    });

    ctx.log.info(
      {
        assetId,
        durationMs: info.durationMs,
        silences: silences.length,
        tempoBpm: reliable ? tempo.bpm : null,
        tempoConfidence: tempo?.confidence ?? null,
        scenesCreated: sceneCount,
        analysisMs: Date.now() - started,
      },
      'audio analyzed',
    );
    return 'ready';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
