import { spawn } from 'node:child_process';
import type { FfprobeResult } from '@sahar/media';

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export class MediaToolError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'MediaToolError';
  }
}

/** Runs ffprobe and returns its JSON. Arguments are passed as an array (no shell). */
export function ffprobe(
  ffprobePath: string,
  file: string,
  timeoutMs = 60_000,
): Promise<FfprobeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new MediaToolError(`ffprobe exited with ${code}`, stderr));
      try {
        resolve(JSON.parse(stdout) as FfprobeResult);
      } catch {
        reject(new MediaToolError('ffprobe returned invalid JSON', stderr));
      }
    });
  });
}

export interface DecodeResult {
  /** FFmpeg log (stderr), e.g. for silencedetect output. */
  log: string;
}

/**
 * Decodes the first audio stream to mono signed 16-bit PCM at `sampleRate`, streaming
 * chunks to `onSamples`, while `silencedetect` reports silences on stderr.
 */
export function decodeMonoPcm(
  ffmpegPath: string,
  file: string,
  sampleRate: number,
  onSamples: (samples: Int16Array) => void,
  { silenceThresholdDb = -40, minSilenceSec = 0.5, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
): Promise<DecodeResult> {
  return new Promise((resolve, reject) => {
    const filter = [
      `aformat=sample_fmts=s16:channel_layouts=mono`,
      `aresample=${sampleRate}`,
      `silencedetect=noise=${silenceThresholdDb}dB:duration=${minSilenceSec}`,
    ].join(',');
    const child = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-nostats',
        '-v',
        'info',
        '-i',
        file,
        '-map',
        '0:a:0',
        '-af',
        filter,
        '-f',
        's16le',
        '-acodec',
        'pcm_s16le',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let log = '';
    let carry: Buffer | null = null;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      let data = carry ? Buffer.concat([carry, chunk]) : chunk;
      carry = null;
      if (data.length % 2 === 1) {
        carry = data.subarray(data.length - 1);
        data = data.subarray(0, data.length - 1);
      }
      // Copy into an aligned buffer: Int16Array views require 2-byte alignment.
      const aligned = new Int16Array(data.length / 2);
      for (let i = 0; i < aligned.length; i++) aligned[i] = data.readInt16LE(i * 2);
      onSamples(aligned);
    });
    child.stderr.on('data', (chunk) => {
      log += chunk;
      if (log.length > 2_000_000) log = log.slice(-1_000_000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(new MediaToolError(`ffmpeg exited with ${code}`, log.slice(-4000)));
      resolve({ log });
    });
  });
}
