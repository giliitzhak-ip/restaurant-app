import sharp from "sharp";
import { designerConfig } from "@/config/brand";

/**
 * Upload sanitisation.
 *
 * A browser-supplied `Content-Type` is a claim, not a fact, so nothing here
 * trusts it. Every uploaded file is:
 *
 *  1. size-checked before it is read,
 *  2. identified by its magic bytes,
 *  3. fully decoded and re-encoded by sharp.
 *
 * Step 3 is what actually makes the file safe: the bytes that reach storage
 * are produced by our encoder, not by the uploader. Polyglots (a GIF that is
 * also valid JavaScript, an SVG carrying a script, a JPEG with a PHP tail) do
 * not survive a decode/encode round trip, and EXIF — which routinely carries
 * GPS coordinates of the customer's home — is dropped because sharp only
 * copies metadata when asked to.
 */

export type ImageRejection = "UNSUPPORTED_TYPE" | "FILE_TOO_LARGE" | "CORRUPT_IMAGE";

export class ImageRejected extends Error {
  constructor(readonly reason: ImageRejection) {
    super(reason);
    this.name = "ImageRejected";
  }
}

export type SniffedFormat = "jpeg" | "png" | "webp" | "avif";

/** Identifies a container by its leading bytes. Returns null for anything else. */
export function sniffImageFormat(bytes: Uint8Array): SniffedFormat | null {
  if (bytes.length < 16) return null;
  const b = bytes;

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "png";

  // RIFF....WEBP
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";

  // ISO-BMFF box named "ftyp" with an AVIF brand
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand === "avif" || brand === "avis") return "avif";
  }

  return null;
}

export interface SafeImage {
  data: Uint8Array;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
}

export interface SanitiseOptions {
  /** Longest edge of the stored image; larger uploads are scaled down. */
  maxEdge?: number;
  /** Output container. WebP keeps room photos small without visible loss. */
  format?: "webp" | "jpeg";
  quality?: number;
  maxBytes?: number;
}

/**
 * Validates and re-encodes an uploaded image.
 *
 * Throws `ImageRejected` so callers can map a reason onto a user-facing
 * message without leaking decoder internals.
 */
export async function sanitiseImageUpload(
  file: File,
  options: SanitiseOptions = {},
): Promise<SafeImage> {
  const maxBytes = options.maxBytes ?? designerConfig.maxUploadBytes;
  if (!file || file.size === 0) throw new ImageRejected("CORRUPT_IMAGE");
  if (file.size > maxBytes) throw new ImageRejected("FILE_TOO_LARGE");

  const raw = new Uint8Array(await file.arrayBuffer());
  if (raw.byteLength > maxBytes) throw new ImageRejected("FILE_TOO_LARGE");

  const sniffed = sniffImageFormat(raw);
  if (!sniffed) throw new ImageRejected("UNSUPPORTED_TYPE");

  // The declared type has to agree with the bytes; a mismatch is a red flag
  // even though the re-encode below would neutralise it anyway.
  const declared = file.type?.toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== `image/${sniffed}`) {
    throw new ImageRejected("UNSUPPORTED_TYPE");
  }

  const maxEdge = options.maxEdge ?? designerConfig.maxRenderEdge;
  const format = options.format ?? "webp";
  const quality = options.quality ?? 82;

  try {
    const pipeline = sharp(raw, { failOn: "error", limitInputPixels: 50_000_000 })
      // Applies the EXIF orientation, then discards the tag with it.
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true });

    const encoded =
      format === "jpeg"
        ? await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true })
        : await pipeline.webp({ quality }).toBuffer({ resolveWithObject: true });

    return {
      data: new Uint8Array(encoded.data),
      contentType: format === "jpeg" ? "image/jpeg" : "image/webp",
      width: encoded.info.width,
      height: encoded.info.height,
      bytes: encoded.info.size,
    };
  } catch {
    throw new ImageRejected("CORRUPT_IMAGE");
  }
}

/** Maps a rejection onto the error codes the UI already knows. */
export function rejectionToError(error: unknown): ImageRejection {
  if (error instanceof ImageRejected) return error.reason;
  return "CORRUPT_IMAGE";
}
