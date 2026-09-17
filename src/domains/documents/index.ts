import { DatabaseDocumentStorage } from './database-storage';
import type { DocumentStorage } from './storage';

export * from './storage';
export * from './gate';
export { DatabaseDocumentStorage } from './database-storage';

let cached: DocumentStorage | null = null;

/**
 * Resolve the configured document store.
 *
 * One implementation exists, and unlike the payment adapter it is not a mock:
 * it really stores the bytes and really reads them back, so there is nothing
 * here to guard against shipping to production. When an object store is
 * added it registers here and nothing else changes.
 */
export function getDocumentStorage(): DocumentStorage {
  if (cached) return cached;
  cached = new DatabaseDocumentStorage();
  return cached;
}

/** Test seam. */
export function setDocumentStorage(storage: DocumentStorage | null): void {
  cached = storage;
}
