import { describe, expect, it } from 'vitest';
import { buildMockArgs } from './mock/ffmpeg-args';
import { createProgressParser } from './mock/progress';
import { createProviderRegistry } from './registry';
import { aspectOf, validateRequest } from './validate';

const registry = createProviderRegistry({ ffmpegPath: 'ffmpeg' });
const mock = registry.get('mock')!;
const localGpu = registry.get('local-gpu')!;
const request = {
  operation: 'AUDIO_TO_VIDEO' as const,
  startMs: 8_000,
  endMs: 14_000,
  width: 1920,
  height: 1080,
  fps: 30,
};

describe('provider registry', () => {
  it('declares the mock provider as a free, local, technical test', () => {
    expect(mock.kind).toBe('technical-test');
    expect(mock.capabilities.execution).toBe('local');
    expect(mock.capabilities.pricing.model).toBe('free');
    expect(mock.availability()).toEqual({ operational: true });
    expect(mock.estimateCost(request)).toEqual({
      amountUsd: '0.00',
      billable: false,
      units: 6,
      unitName: 'seconds',
      basis: 'local-ffmpeg',
    });
  });

  it('never reports the local GPU provider as operational', () => {
    expect(localGpu.availability()).toEqual({ operational: false, reason: 'not-implemented' });
    expect(validateRequest(localGpu, request)).toBe('notOperational');
    expect(() => localGpu.estimateCost(request)).toThrow(/no working backend/);
  });
});

describe('validateRequest', () => {
  it('accepts supported requests and explains rejections', () => {
    expect(validateRequest(mock, request)).toBeNull();
    expect(validateRequest(mock, { ...request, width: 1080, height: 1920 })).toBeNull();
    expect(validateRequest(mock, { ...request, endMs: 8_200 })).toBe('durationTooShort');
    expect(validateRequest(mock, { ...request, endMs: 200_000 })).toBe('durationTooLong');
    expect(validateRequest(mock, { ...request, width: 1000, height: 1000 })).toBe(
      'aspectUnsupported',
    );
    expect(validateRequest(mock, { ...request, width: 3840, height: 2160 })).toBe(
      'resolutionUnsupported',
    );
    expect(validateRequest(mock, { ...request, operation: 'LIP_SYNC' })).toBe(
      'operationUnsupported',
    );
  });

  it('recognizes aspect ratios', () => {
    expect(aspectOf(1920, 1080)).toBe('16:9');
    expect(aspectOf(720, 1280)).toBe('9:16');
    expect(aspectOf(1000, 1000)).toBeNull();
  });
});

describe('mock FFmpeg arguments', () => {
  const plan = {
    songPath: '/in/song.mp3',
    referenceImagePath: '/in/ref.jpg',
    startMs: 8_000,
    endMs: 14_000,
    width: 1080,
    height: 1920,
    fps: 30,
    outputPath: '/out/x.mp4',
    textFiles: { hebrew: '/w/he.txt', english: '/w/en.txt', label: '/w/l.txt' },
    fontRegular: '/f/r.ttf',
    fontBold: '/f/b.ttf',
  };

  it('cuts the exact song segment and produces an iPhone-compatible MP4', () => {
    const args = buildMockArgs(plan);
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('atrim=start=8.000:end=14.000,asetpts=PTS-STARTPTS');
    expect(graph).toContain('s=1080x1920');
    expect(graph).toContain('text_shaping=1');
    for (const pair of [
      ['-c:v', 'libx264'],
      ['-pix_fmt', 'yuv420p'],
      ['-c:a', 'aac'],
      ['-movflags', '+faststart'],
      ['-t', '6.000'],
      ['-r', '30'],
    ]) {
      expect(args[args.indexOf(pair[0]!) + 1]).toBe(pair[1]);
    }
    expect(args.at(-1)).toBe('/out/x.mp4');
  });

  it('uses a plain card when the scene has no reference image', () => {
    const args = buildMockArgs({ ...plan, referenceImagePath: null });
    expect(args).toContain('lavfi');
    expect(args.join(' ')).not.toContain('/in/ref.jpg');
  });
});

describe('progress parser', () => {
  it('reports monotonic fractions from out_time_us and 1 at the end', () => {
    const seen: number[] = [];
    const feed = createProgressParser(10_000, (f) => seen.push(f));
    feed('frame=10\nout_time_us=2500000\nprogress=con');
    feed('tinue\nout_time_us=1000000\nout_time_us=5000');
    feed('000\nprogress=end\n');
    expect(seen).toEqual([0.25, 0.5, 1]);
  });
});
