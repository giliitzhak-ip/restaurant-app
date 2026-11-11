import { createHash } from "node:crypto";

/** Normalize Hebrew/English marketing text for comparison. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[֑-ׇ]/g, "") // niqqud & cantillation
    .replace(/#[^\s#]+/g, " ") // hashtags
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\p{Extended_Pictographic}️]/gu, " ") // emoji
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprint(caption: string): string {
  return createHash("sha256").update(normalizeText(caption)).digest("hex");
}

function shingles(s: string, n = 3): Set<string> {
  const words = normalizeText(s).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < n) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i <= words.length - n; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

/** Jaccard similarity of word 3-grams, 0..1. */
export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function maxSimilarity(text: string, others: string[]): { score: number; index: number } {
  let best = { score: 0, index: -1 };
  others.forEach((o, i) => {
    const s = similarity(text, o);
    if (s > best.score) best = { score: s, index: i };
  });
  return best;
}
