export * from './client';
export * from './keys';

import { ObjectStorage, type StorageConfig } from './client';

/** Builds storage from the validated server env (see @sahar/shared/env). */
export function storageFromEnv(env: {
  S3_ENDPOINT?: string | undefined;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
  S3_FORCE_PATH_STYLE: boolean;
}): ObjectStorage {
  const config: StorageConfig = {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
  return new ObjectStorage(config);
}
