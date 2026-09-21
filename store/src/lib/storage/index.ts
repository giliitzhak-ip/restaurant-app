import path from 'node:path'
import { getEnv } from '@/lib/env'
import { LocalStorageProvider } from './local'
import { S3StorageProvider } from './s3'
import { CloudinaryStorageProvider } from './cloudinary'
import type { StorageProvider } from './types'

export type { StorageProvider, StoredObject, PutObjectInput } from './types'

let cached: StorageProvider | null = null

export function getStorage(): StorageProvider {
  if (cached) return cached
  const env = getEnv()

  switch (env.STORAGE_PROVIDER) {
    case 's3': {
      const missing = (['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'] as const)
        .filter((k) => !env[k])
      if (missing.length) throw new Error(`חסרים משתני סביבה לאחסון S3: ${missing.join(', ')}`)
      cached = new S3StorageProvider({
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION!,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        publicBaseUrl: env.S3_PUBLIC_BASE_URL!,
      })
      break
    }
    case 'cloudinary': {
      if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
        throw new Error('חסרים משתני סביבה לאחסון Cloudinary')
      }
      cached = new CloudinaryStorageProvider({
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET,
      })
      break
    }
    default:
      cached = new LocalStorageProvider(path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR))
  }

  return cached
}

/** Test seam. */
export function __setStorageForTests(provider: StorageProvider | null): void {
  cached = provider
}
