export interface StoredObject {
  key: string
  url: string
  size: number
  mimeType: string
}

export interface PutObjectInput {
  key: string
  body: Buffer
  mimeType: string
  cacheControl?: string
}

/**
 * Every file the application stores goes through this interface, so swapping
 * local disk for S3/Cloudinary is a configuration change, not a code change.
 */
export interface StorageProvider {
  readonly name: string
  put(input: PutObjectInput): Promise<StoredObject>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  publicUrl(key: string): string
}
