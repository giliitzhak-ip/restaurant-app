/**
 * Incremental parser for `ffmpeg -progress pipe:1` output ("key=value" lines). Returns
 * the fraction of `durationMs` encoded so far, from `out_time_us` (real encoder progress).
 */
export function createProgressParser(durationMs: number, onProgress: (fraction: number) => void) {
  let buffer = '';
  let last = -1;
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const [key, value] = line.trim().split('=');
      let fraction: number | null = null;
      if (key === 'out_time_us' || key === 'out_time_ms') {
        // Despite its name, out_time_ms is also in microseconds.
        const us = Number(value);
        if (Number.isFinite(us) && us >= 0) fraction = us / 1000 / durationMs;
      } else if (key === 'progress' && value === 'end') {
        fraction = 1;
      }
      if (fraction !== null) {
        const clamped = Math.min(1, Math.max(0, fraction));
        if (clamped > last) {
          last = clamped;
          onProgress(clamped);
        }
      }
    }
  };
}
