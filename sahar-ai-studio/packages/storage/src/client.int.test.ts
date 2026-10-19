import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ObjectNotFoundError, storageFromEnv } from './index';

const storage = storageFromEnv({
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION ?? 'us-east-1',
  S3_BUCKET: process.env.S3_BUCKET ?? 'sahar-media',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== 'false',
});

async function text(body: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

describe('ObjectStorage (real S3 server)', () => {
  it('streams an upload, reads ranges, downloads and deletes', async () => {
    const key = `test/${randomUUID()}/sample.txt`;
    // 10 MiB + a tail: exercises multipart upload (8 MiB parts).
    const payload = Buffer.concat([Buffer.alloc(10 * 1024 * 1024, 'a'), Buffer.from('THE-END')]);
    await storage.uploadStream(key, Readable.from([payload]), 'text/plain');

    const head = await storage.head(key);
    expect(head?.contentLength).toBe(payload.length);

    const tail = await storage.get(key, `bytes=${payload.length - 7}-`);
    expect(await text(tail.body)).toBe('THE-END');
    expect(tail.contentRange).toBe(
      `bytes ${payload.length - 7}-${payload.length - 1}/${payload.length}`,
    );

    const dir = await mkdtemp(path.join(tmpdir(), 'sahar-storage-'));
    try {
      await storage.downloadToFile(key, path.join(dir, 'out'));
      expect((await readFile(path.join(dir, 'out'))).length).toBe(payload.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    await storage.delete([key]);
    expect(await storage.head(key)).toBeNull();
    await expect(storage.get(key)).rejects.toBeInstanceOf(ObjectNotFoundError);
  }, 60_000);
});
