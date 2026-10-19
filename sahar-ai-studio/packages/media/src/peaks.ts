/**
 * Downsampled waveform for display: one 0–255 value per bucket = max |sample| in the bucket.
 * Fed incrementally with signed 16-bit PCM so a whole song never has to sit in memory.
 */
export interface WaveformPeaks {
  version: 1;
  peaksPerSecond: number;
  durationMs: number;
  peaks: number[];
}

export class PeakAccumulator {
  private readonly samplesPerPeak: number;
  private readonly peaks: number[] = [];
  private current = 0;
  private count = 0;
  private total = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly peaksPerSecond = 100,
  ) {
    this.samplesPerPeak = Math.max(1, Math.round(sampleRate / peaksPerSecond));
  }

  push(samples: Int16Array): void {
    for (let i = 0; i < samples.length; i++) {
      const value = Math.abs(samples[i]!);
      if (value > this.current) this.current = value;
      if (++this.count === this.samplesPerPeak) this.flush();
    }
    this.total += samples.length;
  }

  private flush() {
    this.peaks.push(Math.min(255, Math.round((this.current / 32768) * 255)));
    this.current = 0;
    this.count = 0;
  }

  finish(): WaveformPeaks {
    if (this.count > 0) this.flush();
    return {
      version: 1,
      peaksPerSecond: this.sampleRate / this.samplesPerPeak,
      durationMs: Math.round((this.total / this.sampleRate) * 1000),
      peaks: this.peaks,
    };
  }
}
