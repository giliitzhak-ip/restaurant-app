import type { PutObjectInput, StorageProvider, StoredObject } from './types'

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
}

/**
 * Cloudinary adapter placeholder. Same contract as every other provider;
 * implement the upload call once an account exists.
 */
export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = 'cloudinary'

  constructor(private readonly config: CloudinaryConfig) {}

  private notConfigured(): never {
    throw new Error(
      'ספק אחסון Cloudinary עדיין לא חובר. הגדירו CLOUDINARY_* והשלימו את המימוש ב-src/lib/storage/cloudinary.ts',
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
    return `https://res.cloudinary.com/${this.config.cloudName}/image/upload/${key}`
  }
}
