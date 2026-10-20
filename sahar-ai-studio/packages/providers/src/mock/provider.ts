import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  GenerationAbortedError,
  type CostEstimate,
  type GenerationInput,
  type GenerationOutput,
  type GenerationRequest,
  type LocalRunContext,
  type VideoProvider,
} from '../types';
import { buildMockArgs } from './ffmpeg-args';
import { createProgressParser } from './progress';

export interface MockProviderOptions {
  ffmpegPath: string;
  fontRegular: string;
  fontBold: string;
  /** Hard limit for one render. */
  timeoutMs?: number;
}

export const DEFAULT_FONTS = {
  regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
};

/** Burned into every frame: this output must never be mistaken for AI generation. */
export const MOCK_LABELS = {
  hebrew: 'סרטון בדיקה טכני — לא נוצר בבינה מלאכותית',
  english: 'TECHNICAL TEST RENDER - NOT AI-GENERATED',
};

const RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 1280, height: 720 },
  { width: 720, height: 1280 },
];

/**
 * Mock provider: renders a real H.264/AAC MP4 locally with FFmpeg from the reference
 * image and the exact song segment. No AI, no network, no cost. Its purpose is to test
 * the production pipeline (queue, progress, storage, playback, download) end to end.
 */
export function createMockProvider(options: MockProviderOptions): VideoProvider {
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;

  async function run(input: GenerationInput, ctx: LocalRunContext): Promise<GenerationOutput> {
    if (ctx.signal.aborted) throw new GenerationAbortedError();
    const textFiles = {
      hebrew: path.join(ctx.workDir, 'label-he.txt'),
      english: path.join(ctx.workDir, 'label-en.txt'),
      label: path.join(ctx.workDir, 'label-scene.txt'),
    };
    await Promise.all([
      writeFile(textFiles.hebrew, MOCK_LABELS.hebrew),
      writeFile(textFiles.english, MOCK_LABELS.english),
      writeFile(textFiles.label, input.label),
    ]);
    const outputPath = path.join(ctx.workDir, 'mock-output.mp4');
    const args = buildMockArgs({
      songPath: input.songPath,
      referenceImagePath: input.referenceImagePath,
      startMs: input.startMs,
      endMs: input.endMs,
      width: input.width,
      height: input.height,
      fps: input.fps,
      outputPath,
      textFiles,
      fontRegular: options.fontRegular,
      fontBold: options.fontBold,
    });

    await new Promise<void>((resolve, reject) => {
      const child = spawn(options.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const parse = createProgressParser(input.endMs - input.startMs, ctx.onProgress);
      let stderr = '';
      let aborted = false;
      const kill = () => {
        aborted = true;
        child.kill('SIGKILL');
      };
      const timer = setTimeout(kill, timeoutMs);
      ctx.signal.addEventListener('abort', kill, { once: true });
      child.stdout.setEncoding('utf8').on('data', parse);
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-4000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', kill);
        if (aborted)
          return reject(
            ctx.signal.aborted ? new GenerationAbortedError() : new Error('mock render timed out'),
          );
        if (code !== 0) return reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
        resolve();
      });
    });
    return { path: outputPath, mimeType: 'video/mp4' };
  }

  return {
    key: 'mock',
    kind: 'technical-test',
    capabilities: {
      operations: ['AUDIO_TO_VIDEO'],
      inputs: ['audio', 'reference-image', 'prompt'],
      minDurationMs: 500,
      maxDurationMs: 120_000,
      aspectRatios: ['16:9', '9:16'],
      resolutions: RESOLUTIONS,
      pricing: {
        model: 'free',
        usdPerSecond: '0.0000',
        source: 'local FFmpeg render on this server',
        verifiedAt: '2026-10-19',
      },
      supportsCancel: true,
      supportsWebhooks: false,
      execution: 'local',
    },
    availability() {
      if (!existsSync(options.fontRegular) || !existsSync(options.fontBold)) {
        return { operational: false, reason: 'missing-dependency' };
      }
      return { operational: true };
    },
    estimateCost(request: GenerationRequest): CostEstimate {
      return {
        amountUsd: '0.00',
        billable: false,
        units: Math.round((request.endMs - request.startMs) / 100) / 10,
        unitName: 'seconds',
        basis: 'local-ffmpeg',
      };
    },
    execution: { kind: 'local', run },
  };
}
