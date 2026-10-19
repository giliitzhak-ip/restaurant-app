/**
 * Basic tempo and beat estimation for mono PCM.
 *
 *   1. Onset strength: log-magnitude spectral flux (FFT 1024, hop 256).
 *   2. Tempo: autocorrelation of the onset envelope with a log-normal prior around
 *      120 BPM, refined by summing the autocorrelation over several beat periods.
 *   3. Beats: dynamic-programming beat tracker (Ellis, 2007).
 *
 * The result carries a confidence in [0, 1]. Callers must treat low-confidence results
 * as "no reliable tempo" — real music often has half/double-tempo ambiguity.
 */

export interface TempoEstimate {
  bpm: number;
  /** Half or double tempo when it is almost as plausible (common octave ambiguity). */
  alternativeBpm: number | null;
  confidence: number;
  beatTimesMs: number[];
}

export const TEMPO_ANALYZER = {
  fftSize: 1024,
  hop: 256,
  minBpm: 60,
  maxBpm: 200,
  /** Below this the tempo is not shown or used for scene proposals. */
  reliableConfidence: 0.3,
  /** Mean spectral flux below this means there are no real onsets (silence, steady tones). */
  minMeanFlux: 1,
};

// ─── FFT (in-place iterative radix-2) ───────────────────────────────────────────

function fftMagnitudes(re: Float64Array, im: Float64Array, out: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tRe = re[b]! * curRe - im[b]! * curIm;
        const tIm = re[b]! * curIm + im[b]! * curRe;
        re[b] = re[a]! - tRe;
        im[b] = im[a]! - tIm;
        re[a] = re[a]! + tRe;
        im[a] = im[a]! + tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k]!, im[k]!);
}

/** Onset strength envelope, one value per hop. */
export function onsetEnvelope(
  samples: Float32Array,
  fftSize = TEMPO_ANALYZER.fftSize,
  hop = TEMPO_ANALYZER.hop,
) {
  const bins = fftSize / 2 + 1;
  const window = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize);

  const frames = Math.max(0, Math.floor((samples.length - fftSize) / hop) + 1);
  const envelope = new Float64Array(frames);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  let previous = new Float64Array(bins);
  let current = new Float64Array(bins);

  for (let f = 0; f < frames; f++) {
    const offset = f * hop;
    for (let i = 0; i < fftSize; i++) {
      re[i] = samples[offset + i]! * window[i]!;
      im[i] = 0;
    }
    fftMagnitudes(re, im, current);
    let flux = 0;
    for (let k = 0; k < bins; k++) {
      const value = Math.log1p(100 * current[k]!);
      current[k] = value;
      if (f > 0) flux += Math.max(0, value - previous[k]!);
    }
    envelope[f] = flux;
    [previous, current] = [current, previous];
  }
  return envelope;
}

// ─── Tempo ──────────────────────────────────────────────────────────────────────

function normalizeEnvelope(envelope: Float64Array, framesPerSecond: number): Float64Array | null {
  // Remove slowly varying loudness: subtract a ~1 s moving average, keep positive part.
  const half = Math.max(1, Math.round(framesPerSecond / 2));
  const prefix = new Float64Array(envelope.length + 1);
  for (let i = 0; i < envelope.length; i++) prefix[i + 1] = prefix[i]! + envelope[i]!;
  const out = new Float64Array(envelope.length);
  for (let i = 0; i < envelope.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(envelope.length, i + half + 1);
    out[i] = Math.max(0, envelope[i]! - (prefix[b]! - prefix[a]!) / (b - a));
  }
  let sumSq = 0;
  for (const v of out) sumSq += v * v;
  const rms = Math.sqrt(sumSq / Math.max(1, out.length));
  if (!(rms > 1e-6)) return null;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / rms;
  return out;
}

function autocorrelation(x: Float64Array, maxLag: number): Float64Array {
  const acf = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < x.length; i++) sum += x[i]! * x[i + lag]!;
    acf[lag] = sum / (x.length - lag);
  }
  return acf;
}

const interpolate = (values: Float64Array, position: number) => {
  const i = Math.floor(position);
  const frac = position - i;
  if (i + 1 >= values.length) return values[values.length - 1] ?? 0;
  return values[i]! * (1 - frac) + values[i + 1]! * frac;
};

const tempoPrior = (bpm: number) => Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);

export function estimateTempo(samples: Float32Array, sampleRate: number): TempoEstimate | null {
  const { hop, minBpm, maxBpm } = TEMPO_ANALYZER;
  const fps = sampleRate / hop;
  const envelope = onsetEnvelope(samples);
  if (envelope.length < fps * 8) return null; // need at least ~8 s of audio
  let fluxSum = 0;
  for (const value of envelope) fluxSum += value;
  if (fluxSum / envelope.length < TEMPO_ANALYZER.minMeanFlux) return null;
  const onset = normalizeEnvelope(envelope, fps);
  if (!onset) return null;

  const periods = 6;
  // Covers half of minBpm too, for the octave-alternative check.
  const maxPeriod = (60 * fps) / (minBpm / 2);
  const acf = autocorrelation(onset, Math.ceil(maxPeriod * periods) + 2);
  const zero = acf[0]!;
  if (!(zero > 0)) return null;

  // Multi-period score: true beat periods line up across several multiples.
  const score = (bpm: number) => {
    const period = (60 * fps) / bpm;
    let total = 0;
    for (let k = 1; k <= periods; k++) total += interpolate(acf, k * period) / zero;
    return total / periods;
  };

  let bestBpm = 0;
  let bestWeighted = -Infinity;
  const raw: number[] = [];
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const s = score(bpm);
    raw.push(s);
    const weighted = s * tempoPrior(bpm);
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestBpm = bpm;
    }
  }
  for (let bpm = bestBpm - 1; bpm <= bestBpm + 1; bpm += 0.02) {
    const weighted = score(bpm) * tempoPrior(bpm);
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestBpm = bpm;
    }
  }

  // Confidence: how far the winning periodicity stands above the typical level.
  const sorted = [...raw].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const peak = score(bestBpm);
  const confidence = Math.max(0, Math.min(1, (peak - median) / Math.max(1e-9, 1 - median)));

  let alternativeBpm: number | null = null;
  for (const candidate of [bestBpm * 2, bestBpm / 2]) {
    if (candidate >= minBpm / 2 && candidate <= maxBpm * 1.25 && score(candidate) >= 0.8 * peak) {
      alternativeBpm = Math.round(candidate * 10) / 10;
      break;
    }
  }

  const beats = trackBeats(onset, (60 * fps) / bestBpm);
  const frameCenterMs = (frame: number) =>
    ((frame * hop + TEMPO_ANALYZER.fftSize / 2) / sampleRate) * 1000;
  return {
    bpm: Math.round(bestBpm * 10) / 10,
    alternativeBpm,
    confidence: Math.round(confidence * 1000) / 1000,
    beatTimesMs: beats.map((frame) => Math.round(frameCenterMs(frame))),
  };
}

// ─── Beat tracking ──────────────────────────────────────────────────────────────

export function trackBeats(onset: Float64Array, period: number, tightness = 100): number[] {
  const n = onset.length;
  if (n === 0 || !(period > 1)) return [];

  // Local score: onset envelope smoothed with a Gaussian of width period/32.
  const sigma = Math.max(1, period / 32);
  const radius = Math.ceil(3 * sigma);
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < n) sum += onset[j]! * Math.exp(-0.5 * (k / sigma) ** 2);
    }
    local[i] = sum;
  }

  const cumulative = new Float64Array(n);
  const backlink = new Int32Array(n).fill(-1);
  const minGap = Math.max(1, Math.round(period / 2));
  const maxGap = Math.round(2 * period);
  for (let t = 0; t < n; t++) {
    let best = 0;
    let bestPrev = -1;
    for (let prev = t - maxGap; prev <= t - minGap; prev++) {
      if (prev < 0) continue;
      const penalty = tightness * Math.log((t - prev) / period) ** 2;
      const candidate = cumulative[prev]! - penalty;
      if (bestPrev === -1 || candidate > best) {
        best = candidate;
        bestPrev = prev;
      }
    }
    cumulative[t] = local[t]! + (bestPrev === -1 ? 0 : Math.max(0, best));
    backlink[t] = bestPrev !== -1 && best > 0 ? bestPrev : -1;
  }

  // Last beat: best cumulative score within the final period.
  let last = n - 1;
  for (let t = Math.max(0, n - Math.ceil(period)); t < n; t++)
    if (cumulative[t]! > cumulative[last]!) last = t;

  const beats: number[] = [];
  for (let t = last; t >= 0; t = backlink[t]!) {
    beats.push(t);
    if (backlink[t] === -1) break;
  }
  return beats.reverse();
}
