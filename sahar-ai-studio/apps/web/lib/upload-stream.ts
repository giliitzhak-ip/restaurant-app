import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { SNIFF_BYTES, sniffType, type SniffedType } from '@sahar/media';

export class UploadRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'tooLarge' | 'unsupportedType' | 'empty' | 'lengthMismatch',
  ) {
    super(code);
  }
}

export interface InspectedUpload {
  type: SniffedType;
  /** Stream to hand to storage; enforces the size limit and feeds the hash as it flows. */
  stream: Readable;
  /** Valid once `stream` has been fully consumed. */
  result: () => { sizeBytes: number; sha256: string };
}

/**
 * Reads just enough of a request body to identify the file by its magic bytes, rejects
 * types not in `allowed` before anything is stored, then exposes the full body as a
 * stream that enforces `maxBytes` and computes SHA-256 on the fly.
 */
export async function inspectUpload(
  body: ReadableStream<Uint8Array>,
  allowed: readonly SniffedType[],
  maxBytes: number,
  declaredLength?: number,
): Promise<InspectedUpload> {
  const reader = body.getReader();
  const head: Uint8Array[] = [];
  let headLength = 0;
  while (headLength < SNIFF_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    head.push(value);
    headLength += value.length;
  }
  if (headLength === 0) {
    reader.releaseLock();
    throw new UploadRejectedError(400, 'empty');
  }
  const first = Buffer.concat(head);
  const type = sniffType(first.subarray(0, SNIFF_BYTES));
  if (!type || !allowed.includes(type)) {
    await reader.cancel().catch(() => undefined);
    throw new UploadRejectedError(415, 'unsupportedType');
  }

  const hash = createHash('sha256');
  let size = 0;
  const account = (chunk: Uint8Array) => {
    size += chunk.length;
    if (size > maxBytes) throw new UploadRejectedError(413, 'tooLarge');
    hash.update(chunk);
    return chunk;
  };

  async function* chunks() {
    try {
      yield account(first);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        yield account(value);
      }
      if (declaredLength !== undefined && size !== declaredLength) {
        throw new UploadRejectedError(400, 'lengthMismatch');
      }
    } finally {
      reader.releaseLock();
    }
  }

  let digest: string | null = null;
  return {
    type,
    stream: Readable.from(chunks(), { objectMode: false }),
    result: () => {
      digest ??= hash.digest('hex');
      return { sizeBytes: size, sha256: digest };
    },
  };
}
