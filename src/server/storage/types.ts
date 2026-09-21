export interface StoredFile {
  /** Publicly reachable URL. */
  url: string;
  /** Driver-specific key, kept so the file can be deleted later. */
  key: string;
  contentType: string;
  bytes: number;
}

export interface SaveFileInput {
  data: Uint8Array;
  contentType: string;
  /** Used to build a readable key, e.g. "room-design" or a product slug. */
  keyHint: string;
}

/**
 * The random component of an object key.
 *
 * A stored room photo is reachable by whoever holds its URL — neither driver
 * performs a per-request authorisation check, because neither a static
 * `public/` path nor a plain bucket URL has a request to check. The key is
 * therefore a capability, and its only defence is being unguessable.
 *
 * 128 bits of CSPRNG output, rather than the 48 this used to carry. 48 bits is
 * beyond casual guessing but within reach of a determined scan against a
 * predictable month prefix, and the thing being guessed is a photograph of the
 * inside of somebody's home.
 *
 * This is a mitigation, not an access control. Real per-user authorisation
 * needs short-lived signed URLs from the storage backend; that gap is recorded
 * in docs/SECURITY-CHECKLIST.md and docs/MANUAL-REVIEW-REQUIRED.md.
 */
export function objectKeySuffix(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Object storage.
 *
 * Room photos and admin texture uploads go through this interface, so moving
 * from the local disk to S3 / R2 / GCS is one adapter and one env var — no
 * component or route knows where a file physically lives.
 */
export interface StorageDriver {
  readonly id: string;
  save(input: SaveFileInput): Promise<StoredFile>;
  remove(key: string): Promise<void>;
}
