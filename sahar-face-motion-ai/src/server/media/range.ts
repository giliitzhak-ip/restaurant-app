import type { ByteRange } from "@/server/storage/types";

/** Parses a single-range `Range: bytes=…` header. Multi-range requests are served as full content (null). */
export function parseRange(header: string, total: number): ByteRange | "invalid" | null {
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return header.startsWith("bytes=") && header.includes(",") ? null : "invalid";
  const [, s, e] = m;
  if (total === 0) return "invalid";
  let start: number;
  let end: number;
  if (s === "" && e === "") return "invalid";
  if (s === "") {
    // suffix: last N bytes
    const n = Number(e);
    if (n === 0) return "invalid";
    start = Math.max(0, total - n);
    end = total - 1;
  } else {
    start = Number(s);
    end = e === "" ? total - 1 : Math.min(Number(e), total - 1);
  }
  if (start > end || start >= total) return "invalid";
  return { start, end };
}
