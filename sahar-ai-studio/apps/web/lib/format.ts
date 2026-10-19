/** 83_456 → "1:23.4" (minutes:seconds.tenths); always LTR digits. */
export function formatTime(ms: number, { tenths = true } = {}): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const base = `${minutes}:${String(seconds).padStart(2, '0')}`;
  return tenths ? `${base}.${Math.floor((safe % 1000) / 100)}` : base;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
