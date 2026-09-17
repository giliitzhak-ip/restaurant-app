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
