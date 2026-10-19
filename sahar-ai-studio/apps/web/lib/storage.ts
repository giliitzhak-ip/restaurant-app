import 'server-only';
import { storageFromEnv, type ObjectStorage } from '@sahar/storage';
import { getServerEnv } from './env';

const globalForStorage = globalThis as unknown as { __saharStorage?: ObjectStorage };

export function getStorage(): ObjectStorage {
  globalForStorage.__saharStorage ??= storageFromEnv(getServerEnv());
  return globalForStorage.__saharStorage;
}
