import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface StorageConfig {
  endpoint?: string | undefined;
  region: string;
  bucket: string;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  forcePathStyle: boolean;
}

export interface StoredObject {
  body: Readable;
  contentLength: number;
  contentType?: string | undefined;
  contentRange?: string | undefined;
  eTag?: string | undefined;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      'Object storage is not configured (S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)',
    );
    this.name = 'StorageNotConfiguredError';
  }
}

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

/** Thin wrapper over the S3 API. Every object is private; nothing here sets public ACLs. */
export class ObjectStorage {
  readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: StorageConfig) {
    if (!config.accessKeyId || !config.secretAccessKey) throw new StorageNotConfiguredError();
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Self-hosted S3 servers do not all support the newer default checksum headers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /** Streams a body of unknown length (multipart under the hood). */
  async uploadStream(key: string, body: Readable, contentType: string): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await upload.done();
  }

  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** `range` is an HTTP Range header value such as "bytes=0-1023". */
  async get(key: string, range?: string): Promise<StoredObject> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(range ? { Range: range } : {}) }),
      );
      if (!result.Body) throw new ObjectNotFoundError(key);
      return {
        body: result.Body as Readable,
        contentLength: Number(result.ContentLength ?? 0),
        contentType: result.ContentType,
        contentRange: result.ContentRange,
        eTag: result.ETag,
      };
    } catch (error) {
      throw normalizeError(error, key);
    }
  }

  async head(
    key: string,
  ): Promise<{ contentLength: number; contentType?: string | undefined } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { contentLength: Number(result.ContentLength ?? 0), contentType: result.ContentType };
    } catch (error) {
      const normalized = normalizeError(error, key);
      if (normalized instanceof ObjectNotFoundError) return null;
      throw normalized;
    }
  }

  async downloadToFile(key: string, path: string): Promise<void> {
    const object = await this.get(key);
    await pipeline(object.body, createWriteStream(path));
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

function normalizeError(error: unknown, key: string): Error {
  if (error instanceof ObjectNotFoundError) return error;
  if (
    error instanceof S3ServiceException &&
    (error.name === 'NoSuchKey' ||
      error.name === 'NotFound' ||
      error.$metadata.httpStatusCode === 404)
  ) {
    return new ObjectNotFoundError(key);
  }
  return error instanceof Error ? error : new Error(String(error));
}
