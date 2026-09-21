import crypto from 'node:crypto'
import sharp from 'sharp'
import { getStorage } from '@/lib/storage'
import { RENDITIONS, type MediaVariants, type RenditionName } from './renditions'
import { extensionForMime, MAX_IMAGE_DIMENSION, MIN_IMAGE_DIMENSION, type AllowedImageMime } from './validation'

export interface ProcessedImage {
  storageKey: string
  url: string
  mimeType: string
  width: number
  height: number
  fileSize: number
  checksum: string
  variants: MediaVariants
}

function randomKeyPart(): string {
  return crypto.randomBytes(8).toString('hex')
}

/**
 * Re-encodes the upload (stripping any embedded metadata or payloads), derives
 * the storefront renditions and persists everything through the storage
 * provider. Aspect ratio is always preserved — product photos are never
 * stretched; smaller sources are padded onto a neutral background instead.
 */
export async function processAndStoreImage(
  buffer: Buffer,
  mimeType: AllowedImageMime,
  folder = 'products',
): Promise<ProcessedImage> {
  const storage = getStorage()
  const base = sharp(buffer, { failOn: 'error' })
  const metadata = await base.metadata()

  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    throw new Error(`התמונה קטנה מדי (מינימום ${MIN_IMAGE_DIMENSION}px בכל צד)`)
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`התמונה גדולה מדי (מקסימום ${MAX_IMAGE_DIMENSION}px בכל צד)`)
  }

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex')
  const prefix = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomKeyPart()}`
  const ext = extensionForMime(mimeType)

  // Original, re-encoded without metadata.
  const originalBuffer = await sharp(buffer).rotate().toBuffer()
  const originalKey = `${prefix}/original.${ext}`
  const original = await storage.put({
    key: originalKey,
    body: originalBuffer,
    mimeType,
    cacheControl: 'public, max-age=31536000, immutable',
  })

  const variants: MediaVariants = {}
  for (const name of Object.keys(RENDITIONS) as RenditionName[]) {
    const spec = RENDITIONS[name]
    const pipeline = sharp(buffer)
      .rotate()
      .resize({
        width: spec.width,
        height: spec.height,
        fit: 'contain',
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .webp({ quality: name === 'thumbnail' ? 78 : 86 })

    const out = await pipeline.toBuffer({ resolveWithObject: true })
    const key = `${prefix}/${name}.webp`
    const stored = await storage.put({
      key,
      body: out.data,
      mimeType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    })
    variants[name] = { key, url: stored.url, width: out.info.width, height: out.info.height }
  }

  return {
    storageKey: originalKey,
    url: original.url,
    mimeType,
    width,
    height,
    fileSize: originalBuffer.byteLength,
    checksum,
    variants,
  }
}
