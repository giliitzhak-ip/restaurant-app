import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM helper shared with the other suites
import { ensureFixtures, FIXTURE_FACTS } from '../../../scripts/fixtures.mjs';
import { createProviderRegistry } from './registry';
import { GenerationAbortedError, type LocalExecution } from './types';

const fixtures = ensureFixtures(path.join(tmpdir(), 'sahar-fixtures'));
const mock = createProviderRegistry({ ffmpegPath: 'ffmpeg' }).get('mock')!;
const run = (mock.execution as LocalExecution).run;
let workDir: string;

function probe(file: string) {
  return JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      file,
    ]).toString(),
  );
}

/** Peak level (dBFS) of the output's audio within [startSec, startSec + durationSec). */
function peakDb(file: string, startSec: number, durationSec: number) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-ss',
      String(startSec),
      '-t',
      String(durationSec),
      '-i',
      file,
      '-vn',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  const match = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(result.stderr);
  if (!match) throw new Error(`volumedetect failed: ${result.stderr.slice(-500)}`);
  return match[1] === '-inf' ? -Infinity : Number(match[1]);
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'sahar-mock-'));
});
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('mock provider (real FFmpeg render)', () => {
  it('renders a 16:9 1080p test video that keeps the original audio timing', async () => {
    const progress: number[] = [];
    const ctx = {
      workDir,
      onProgress: (f: number) => progress.push(f),
      signal: new AbortController().signal,
    };
    const output = await run(
      {
        operation: 'AUDIO_TO_VIDEO',
        startMs: 8_000,
        endMs: 14_000,
        width: 1920,
        height: 1080,
        fps: 30,
        songPath: fixtures.songMp3,
        referenceImagePath: fixtures.referenceJpg,
        prompt: '',
        label: 'Scene 2 · 0:08.0-0:14.0',
      },
      ctx,
    );

    const info = probe(output.path);
    const video = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    const audio = info.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    expect(video).toMatchObject({
      codec_name: 'h264',
      profile: 'High',
      width: 1920,
      height: 1080,
      pix_fmt: 'yuv420p',
      r_frame_rate: '30/1',
    });
    expect(audio).toMatchObject({
      codec_name: 'aac',
      profile: 'LC',
      sample_rate: '48000',
      channels: 2,
    });
    expect(Math.abs(Number(info.format.duration) - 6)).toBeLessThan(0.05);

    // faststart: the moov atom precedes mdat, so iPhone Safari can start playing at once.
    const bytes = await readFile(output.path);
    expect(bytes.indexOf('moov')).toBeGreaterThan(-1);
    expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat'));

    // Sync: song silence 9.67–12.10 s maps to 1.67–4.10 s in the clip; clicks around it.
    const { startMs, endMs } = FIXTURE_FACTS.silence;
    expect(
      peakDb(output.path, (startMs - 8_000) / 1000 + 0.15, (endMs - startMs) / 1000 - 0.3),
    ).toBeLessThan(-60);
    expect(peakDb(output.path, 0, 1.5)).toBeGreaterThan(-12);
    expect(peakDb(output.path, 4.2, 1.5)).toBeGreaterThan(-12);

    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  }, 60_000);

  it('renders 9:16 portrait without a reference image', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sahar-mock-p-'));
    const output = await run(
      {
        operation: 'AUDIO_TO_VIDEO',
        startMs: 0,
        endMs: 3_000,
        width: 1080,
        height: 1920,
        fps: 30,
        songPath: fixtures.songWav,
        referenceImagePath: null,
        prompt: '',
        label: 'Scene 1',
      },
      { workDir: dir, onProgress: () => undefined, signal: new AbortController().signal },
    );
    const video = probe(output.path).streams.find(
      (s: { codec_type: string }) => s.codec_type === 'video',
    );
    expect(video).toMatchObject({ width: 1080, height: 1920 });
    await rm(dir, { recursive: true, force: true });
  }, 60_000);

  it('can be cancelled mid-render', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sahar-mock-c-'));
    const controller = new AbortController();
    const promise = run(
      {
        operation: 'AUDIO_TO_VIDEO',
        startMs: 0,
        endMs: 30_000,
        width: 1920,
        height: 1080,
        fps: 30,
        songPath: fixtures.songMp3,
        referenceImagePath: fixtures.referenceJpg,
        prompt: '',
        label: 'cancel',
      },
      {
        workDir: dir,
        onProgress: (f) => f > 0.05 && controller.abort(),
        signal: controller.signal,
      },
    );
    await expect(promise).rejects.toBeInstanceOf(GenerationAbortedError);
    await rm(dir, { recursive: true, force: true });
  }, 60_000);
});
