import type { PutObjectInput, StorageProvider, StoredObject } from './types'

export interface S3Config {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
}

/**
 * S3-compatible adapter. The transport is intentionally not implemented yet —
 * the credentials are not in our hands. Wiring it up means adding
 * @aws-sdk/client-s3 and filling in `put`/`delete`/`exists`; nothing else in
 * the codebase changes.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3'

  constructor(private readonly config: S3Config) {}

  private notConfigured(): never {
    throw new Error(
      'ספק אחסון S3 עדיין לא חובר. הגדירו S3_* במשתני הסביבה והשלימו את מימוש ה-SDK ב-src/lib/storage/s3.ts',
    )
  }

  async put(_input: PutObjectInput): Promise<StoredObject> {
    void _input
    this.notConfigured()
  }

  async delete(_key: string): Promise<void> {
    void _key
    this.notConfigured()
  }

  async exists(_key: string): Promise<boolean> {
    void _key
    this.notConfigured()
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}`
  }
}
