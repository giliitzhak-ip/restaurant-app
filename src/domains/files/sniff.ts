/**
 * What a file actually is, from its own leading bytes.
 *
 * Shared by provider documents and job photos because the reasoning is
 * identical and must not be re-derived: a client-declared Content-Type is a
 * request, not a fact. Accepting it would let somebody upload an HTML file
 * labelled `image/png`; served back from our own origin, that is script
 * execution in whatever session opens it — an admin who can verify providers,
 * or a customer looking at photos of their own home.
 *
 * Deliberately short and strict. These are the formats a phone camera, a
 * scanner and a PDF export produce; anything else is refused rather than
 * stored and puzzled over later.
 */
export const FILE_TYPES = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export type SniffedType = (typeof FILE_TYPES)[keyof typeof FILE_TYPES];

/** Identify a file, or null if it is none of the four. */
export function sniffFileType(bytes: Buffer): SniffedType | null {
  if (bytes.length < 12) return null;

  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return FILE_TYPES.pdf;
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return FILE_TYPES.jpeg;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return FILE_TYPES.png;
  }
  // WebP: "RIFF" .... "WEBP"
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return FILE_TYPES.webp;
  }
  return null;
}

/** Pictures only. A job photo has no business being a PDF. */
export const IMAGE_TYPES: readonly SniffedType[] = [
  FILE_TYPES.jpeg,
  FILE_TYPES.png,
  FILE_TYPES.webp,
];

export function isImageType(type: SniffedType | null): boolean {
  return type !== null && IMAGE_TYPES.includes(type);
}

/** 10 MB, matching the CHECK constraints in migrations 0031 and 0034. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Headers for serving a file somebody else uploaded.
 *
 * The sniffing above makes the Content-Type honest; these make the honesty
 * redundant. `attachment` stops the browser rendering it in our origin at
 * all, `nosniff` stops it second-guessing the type, and the CSP neutralises
 * anything a future format change might smuggle in.
 */
export function privateFileHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Disposition': 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, no-store',
  };
}
