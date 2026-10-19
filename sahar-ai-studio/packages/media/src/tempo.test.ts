import { describe, expect, it } from 'vitest';
import { estimateTempo, TEMPO_ANALYZER } from './tempo';

const SR = 11_025;

/** Deterministic pseudo-random noise so tests are reproducible. */
function noise(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32 - 0.5;
  };
}

/** Percussive clicks (decaying noise bursts) at a fixed tempo, optionally over a tone and noise bed. */
function clickTrack(
  bpm: number,
  seconds: number,
  { offsetMs = 100, bed = 0, accentEvery = 0 } = {},
) {
  const samples = new Float32Array(SR * seconds);
  const rand = noise(bpm * 1000 + seconds);
  const beatTimes: number[] = [];
  for (let t = offsetMs / 1000, i = 0; t < seconds - 0.1; t += 60 / bpm, i++) {
    beatTimes.push(Math.round(t * 1000));
    const start = Math.round(t * SR);
    const gain = accentEvery && i % accentEvery === 0 ? 1 : 0.7;
    for (let k = 0; k < 600 && start + k < samples.length; k++) {
      samples[start + k]! += gain * rand() * 2 * Math.exp(-k / 120);
    }
  }
  if (bed > 0) {
    for (let i = 0; i < samples.length; i++) {
      samples[i]! += bed * (0.5 * Math.sin((2 * Math.PI * 220 * i) / SR) + rand());
    }
  }
  return { samples, beatTimes };
}

describe('estimateTempo', () => {
  it('reports the octave alternative when half/double tempo is ambiguous', () => {
    // 174 BPM clicks are equally consistent with 87 BPM; the estimator must say so.
    const estimate = estimateTempo(clickTrack(174, 30).samples, SR)!;
    const values = [estimate.bpm, estimate.alternativeBpm];
    expect(values.some((v) => v !== null && Math.abs(v - 174) <= 1.5)).toBe(true);
    expect(values.some((v) => v !== null && Math.abs(v - 87) <= 1)).toBe(true);
  });

  for (const bpm of [72, 96, 120, 128, 140]) {
    it(`finds ${bpm} BPM within ±1.5 BPM with high confidence`, () => {
      const { samples } = clickTrack(bpm, 30);
      const estimate = estimateTempo(samples, SR)!;
      expect(estimate).not.toBeNull();
      expect(Math.abs(estimate.bpm - bpm)).toBeLessThanOrEqual(1.5);
      expect(estimate.confidence).toBeGreaterThanOrEqual(TEMPO_ANALYZER.reliableConfidence);
    });
  }

  it('places beats within 35 ms of the true beat times', () => {
    const { samples, beatTimes } = clickTrack(120, 30, { offsetMs: 330 });
    const estimate = estimateTempo(samples, SR)!;
    const matched = estimate.beatTimesMs.filter((beat) =>
      beatTimes.some((truth) => Math.abs(truth - beat) <= 35),
    );
    expect(matched.length / estimate.beatTimesMs.length).toBeGreaterThanOrEqual(0.9);
    expect(estimate.beatTimesMs.length).toBeGreaterThanOrEqual(beatTimes.length - 3);
  });

  it('still works with a tonal bed and noise underneath', () => {
    const { samples } = clickTrack(110, 30, { bed: 0.08, accentEvery: 4 });
    const estimate = estimateTempo(samples, SR)!;
    expect(Math.abs(estimate.bpm - 110)).toBeLessThanOrEqual(1.5);
    expect(estimate.confidence).toBeGreaterThanOrEqual(TEMPO_ANALYZER.reliableConfidence);
  });

  it('reports low confidence for unpulsed noise', () => {
    const rand = noise(7);
    const samples = Float32Array.from({ length: SR * 30 }, () => rand() * 0.5);
    const estimate = estimateTempo(samples, SR);
    expect(estimate === null || estimate.confidence < TEMPO_ANALYZER.reliableConfidence).toBe(true);
  });

  it('returns null for silence, steady tones and clips that are too short', () => {
    expect(estimateTempo(new Float32Array(SR * 20), SR)).toBeNull();
    const tone = Float32Array.from(
      { length: SR * 20 },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR),
    );
    const toneEstimate = estimateTempo(tone, SR);
    expect(
      toneEstimate === null || toneEstimate.confidence < TEMPO_ANALYZER.reliableConfidence,
    ).toBe(true);
    expect(estimateTempo(clickTrack(120, 5).samples, SR)).toBeNull();
  });
});
