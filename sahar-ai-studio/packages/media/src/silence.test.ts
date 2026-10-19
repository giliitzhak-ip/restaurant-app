import { describe, expect, it } from 'vitest';
import { parseSilenceDetect } from './silence';

describe('parseSilenceDetect', () => {
  it('parses ffmpeg output including leading and trailing silences', () => {
    const log = [
      '[silencedetect @ 0x1] silence_start: -0.0123',
      '[silencedetect @ 0x1] silence_end: 1.5 | silence_duration: 1.51',
      'size=N/A time=00:00:10.00 bitrate=N/A speed= 500x',
      '[silencedetect @ 0x1] silence_start: 4.25',
      '[silencedetect @ 0x1] silence_end: 5.75 | silence_duration: 1.5',
      '[silencedetect @ 0x1] silence_start: 9.1',
    ].join('\n');
    expect(parseSilenceDetect(log, 10_000)).toEqual([
      { startMs: 0, endMs: 1500 },
      { startMs: 4250, endMs: 5750 },
      { startMs: 9100, endMs: 10_000 },
    ]);
  });

  it('returns nothing for non-silent audio', () => {
    expect(parseSilenceDetect('frame=0 fps=0', 5000)).toEqual([]);
  });
});
