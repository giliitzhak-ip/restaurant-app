// Formatting helpers shared by server and client (no Node imports).

/** Wrapped in Unicode LTR isolates so "15.0 MB" doesn't flip to "MB 15.0" inside Hebrew text. */
export function formatBytes(n: number): string {
  const v =
    n < 1024 ? `${n} B`
    : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB`
    : n < 1024 * 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `\u2066${v}\u2069`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" });
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
export function formatRelative(iso: string, now = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(iso);
}

export const KIND_LABEL = { IMAGE: "תמונה", VIDEO: "סרטון", AUDIO: "אודיו" } as const;
