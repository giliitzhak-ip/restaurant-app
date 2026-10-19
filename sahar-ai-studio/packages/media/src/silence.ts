export interface TimeRange {
  startMs: number;
  endMs: number;
}

/**
 * Parses FFmpeg `silencedetect` log lines into ranges. A silence still open at the end
 * of the file is closed at `durationMs`.
 */
export function parseSilenceDetect(log: string, durationMs: number): TimeRange[] {
  const ranges: TimeRange[] = [];
  let open: number | null = null;
  for (const line of log.split(/\r?\n/)) {
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (start) {
      open = Math.max(0, Math.round(Number(start[1]) * 1000));
      continue;
    }
    const end = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (end && open !== null) {
      const endMs = Math.min(durationMs, Math.round(Number(end[1]) * 1000));
      if (endMs > open) ranges.push({ startMs: open, endMs });
      open = null;
    }
  }
  if (open !== null && durationMs > open) ranges.push({ startMs: open, endMs: durationMs });
  return ranges;
}
