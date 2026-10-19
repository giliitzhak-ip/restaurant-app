/** Subset of `ffprobe -print_format json -show_format -show_streams` output that we use. */
export interface FfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  width?: number;
  height?: number;
  bit_rate?: string;
  duration?: string;
  disposition?: { attached_pic?: number };
}

export interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: { format_name?: string; duration?: string; bit_rate?: string };
}

export interface AudioInfo {
  durationMs: number;
  sampleRate: number;
  channels: number;
  codec: string;
  bitRate: number | null;
}

export interface ImageInfo {
  width: number;
  height: number;
  codec: string;
}

export type ProbeVerdict<T> = { ok: true; info: T } | { ok: false; reason: string };

export const AUDIO_LIMITS = { maxDurationMs: 20 * 60 * 1000, minDurationMs: 1000 };
export const IMAGE_LIMITS = { minSide: 256, maxSide: 12_000 };

const AUDIO_CODECS = /^(mp3|mp3float|pcm_(s16le|s24le|s32le|f32le|f64le|u8|s16be|s24be))$/;

export function validateAudioProbe(probe: FfprobeResult): ProbeVerdict<AudioInfo> {
  const formatName = probe.format?.format_name ?? '';
  if (!/(^|,)(mp3|wav)(,|$)/.test(formatName))
    return { ok: false, reason: `unsupported container: ${formatName || 'unknown'}` };

  const streams = probe.streams ?? [];
  const audio = streams.filter((s) => s.codec_type === 'audio');
  // MP3 cover art is exposed as a video stream flagged attached_pic; anything else is rejected.
  const realVideo = streams.filter(
    (s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1,
  );
  if (audio.length !== 1)
    return { ok: false, reason: `expected exactly one audio stream, found ${audio.length}` };
  if (realVideo.length > 0) return { ok: false, reason: 'file contains video' };

  const stream = audio[0]!;
  const codec = stream.codec_name ?? '';
  if (!AUDIO_CODECS.test(codec))
    return { ok: false, reason: `unsupported audio codec: ${codec || 'unknown'}` };

  const durationSec = Number(stream.duration ?? probe.format?.duration);
  const sampleRate = Number(stream.sample_rate);
  const channels = Number(stream.channels);
  if (!Number.isFinite(durationSec) || durationSec <= 0)
    return { ok: false, reason: 'unknown duration' };
  const durationMs = Math.round(durationSec * 1000);
  if (durationMs < AUDIO_LIMITS.minDurationMs) return { ok: false, reason: 'audio is too short' };
  if (durationMs > AUDIO_LIMITS.maxDurationMs) return { ok: false, reason: 'audio is too long' };
  if (!Number.isInteger(sampleRate) || sampleRate < 8000)
    return { ok: false, reason: 'invalid sample rate' };
  if (!Number.isInteger(channels) || channels < 1 || channels > 8)
    return { ok: false, reason: 'invalid channel count' };

  const bitRate = Number(stream.bit_rate ?? probe.format?.bit_rate);
  return {
    ok: true,
    info: {
      durationMs,
      sampleRate,
      channels,
      codec,
      bitRate: Number.isFinite(bitRate) ? Math.round(bitRate) : null,
    },
  };
}

const IMAGE_CODECS = new Set(['mjpeg', 'png', 'webp']);

export function validateImageProbe(probe: FfprobeResult): ProbeVerdict<ImageInfo> {
  const streams = probe.streams ?? [];
  if (streams.length !== 1 || streams[0]?.codec_type !== 'video')
    return { ok: false, reason: 'not a single still image' };
  const stream = streams[0];
  const codec = stream.codec_name ?? '';
  if (!IMAGE_CODECS.has(codec))
    return { ok: false, reason: `unsupported image codec: ${codec || 'unknown'}` };
  const width = Number(stream.width);
  const height = Number(stream.height);
  if (!Number.isInteger(width) || !Number.isInteger(height))
    return { ok: false, reason: 'unknown dimensions' };
  if (Math.min(width, height) < IMAGE_LIMITS.minSide)
    return { ok: false, reason: 'image is too small' };
  if (Math.max(width, height) > IMAGE_LIMITS.maxSide)
    return { ok: false, reason: 'image is too large' };
  return { ok: true, info: { width, height, codec } };
}
