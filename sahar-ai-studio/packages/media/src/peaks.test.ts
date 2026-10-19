import { describe, expect, it } from 'vitest';
import { PeakAccumulator } from './peaks';

describe('PeakAccumulator', () => {
  it('produces one peak per bucket across chunk boundaries', () => {
    const acc = new PeakAccumulator(1000, 100); // 10 samples per peak
    const samples = new Int16Array(35);
    samples[3] = 16384; // bucket 0 → 0.5
    samples[15] = -32768; // bucket 1 → 1.0
    samples[33] = 3277; // bucket 3 (partial) → ~0.1
    acc.push(samples.subarray(0, 12));
    acc.push(samples.subarray(12));
    const result = acc.finish();
    expect(result.peaks).toEqual([128, 255, 0, 26]);
    expect(result.durationMs).toBe(35);
    expect(result.peaksPerSecond).toBe(100);
  });
});
