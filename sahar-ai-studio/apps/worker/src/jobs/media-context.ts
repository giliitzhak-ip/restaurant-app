import type { PrismaClient } from '@sahar/db';
import type { Logger } from '@sahar/shared/logger';
import type { ObjectStorage } from '@sahar/storage';

export interface MediaContext {
  db: PrismaClient;
  storage: ObjectStorage;
  log: Logger;
  ffmpegPath: string;
  ffprobePath: string;
  /** Parent directory for per-job scratch directories. */
  tmpRoot: string;
}

/** Thrown for bad user media: the asset is marked FAILED and the job is not retried. */
export class InvalidMediaError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'InvalidMediaError';
  }
}
