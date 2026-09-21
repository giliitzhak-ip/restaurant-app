import { prisma } from '@/lib/db'
import { getStorage } from '@/lib/storage'
import { getEnv } from '@/lib/env'
import { validateImageUpload } from './validation'
import { processAndStoreImage } from './process'
import { variantsFromJson } from './renditions'
import type { Prisma } from '@/generated/prisma/client'

export interface UploadResult {
  mediaId: string
  url: string
  thumbnailUrl: string
  fileName: string
}

export function maxUploadBytes(): number {
  return getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024
}

/**
 * Validate → re-encode → store → persist. Identical files (same sha256) are
 * de-duplicated so re-uploading a photo does not grow the library.
 */
export async function ingestImage(params: {
  fileName: string
  buffer: Buffer
  declaredMime?: string
  alt?: string | null
  folder?: string
}): Promise<{ mediaId: string; url: string; thumbnailUrl: string; deduplicated: boolean }> {
  const validation = validateImageUpload({
    fileName: params.fileName,
    buffer: params.buffer,
    declaredMime: params.declaredMime,
    maxBytes: maxUploadBytes(),
  })
  if (!validation.ok) throw new Error(validation.error)

  const processed = await processAndStoreImage(params.buffer, validation.mimeType, params.folder ?? 'products')

  const existing = await prisma.media.findFirst({ where: { checksum: processed.checksum } })
  if (existing) {
    return {
      mediaId: existing.id,
      url: existing.url,
      thumbnailUrl: variantsFromJson(existing.variants).thumbnail?.url ?? existing.url,
      deduplicated: true,
    }
  }

  const media = await prisma.media.create({
    data: {
      storageKey: processed.storageKey,
      url: processed.url,
      provider: getStorage().name,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      fileSize: processed.fileSize,
      checksum: processed.checksum,
      originalName: params.fileName,
      alt: params.alt ?? null,
      variants: processed.variants as unknown as Prisma.InputJsonValue,
      folder: params.folder ?? 'products',
    },
  })

  return {
    mediaId: media.id,
    url: media.url,
    thumbnailUrl: processed.variants.thumbnail?.url ?? media.url,
    deduplicated: false,
  }
}

/** Attaches media to a product, appending to the end of the gallery. */
export async function attachMediaToProduct(productId: string, mediaId: string, alt?: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.productMedia.findUnique({
      where: { productId_mediaId: { productId, mediaId } },
    })
    if (existing) return existing

    const count = await tx.productMedia.count({ where: { productId } })
    return tx.productMedia.create({
      data: {
        productId,
        mediaId,
        position: count,
        isMain: count === 0, // the first image becomes the main image by default
        alt: alt ?? null,
      },
    })
  })
}

export async function detachMediaFromProduct(productId: string, productMediaId: string) {
  return prisma.$transaction(async (tx) => {
    const link = await tx.productMedia.findUnique({ where: { id: productMediaId } })
    if (!link || link.productId !== productId) throw new Error('התמונה אינה משויכת למוצר זה')

    await tx.productMedia.delete({ where: { id: productMediaId } })

    const remaining = await tx.productMedia.findMany({
      where: { productId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    })
    for (const [index, item] of remaining.entries()) {
      await tx.productMedia.update({
        where: { id: item.id },
        data: { position: index, isMain: link.isMain ? index === 0 : item.isMain },
      })
    }
  })
}

/** Exactly one main image per product — enforced in a single transaction. */
export async function setMainProductMedia(productId: string, productMediaId: string) {
  return prisma.$transaction(async (tx) => {
    const link = await tx.productMedia.findUnique({ where: { id: productMediaId } })
    if (!link || link.productId !== productId) throw new Error('התמונה אינה משויכת למוצר זה')
    await tx.productMedia.updateMany({ where: { productId }, data: { isMain: false } })
    await tx.productMedia.update({ where: { id: productMediaId }, data: { isMain: true } })
  })
}

export async function reorderProductMedia(productId: string, orderedIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const links = await tx.productMedia.findMany({ where: { productId } })
    const known = new Set(links.map((l) => l.id))
    if (orderedIds.length !== links.length || orderedIds.some((id) => !known.has(id))) {
      throw new Error('רשימת הסדר אינה תואמת את תמונות המוצר')
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.productMedia.update({ where: { id }, data: { position: index } })
    }
  })
}

export async function updateProductMediaAlt(productId: string, productMediaId: string, alt: string) {
  const link = await prisma.productMedia.findUnique({ where: { id: productMediaId } })
  if (!link || link.productId !== productId) throw new Error('התמונה אינה משויכת למוצר זה')
  return prisma.productMedia.update({ where: { id: productMediaId }, data: { alt: alt || null } })
}

/**
 * Replaces the binary behind an existing gallery slot, keeping its position
 * and main flag.
 */
export async function replaceProductMedia(params: {
  productId: string
  productMediaId: string
  fileName: string
  buffer: Buffer
  declaredMime?: string
}) {
  const link = await prisma.productMedia.findUnique({ where: { id: params.productMediaId } })
  if (!link || link.productId !== params.productId) throw new Error('התמונה אינה משויכת למוצר זה')

  const ingested = await ingestImage({
    fileName: params.fileName,
    buffer: params.buffer,
    declaredMime: params.declaredMime,
  })

  const duplicate = await prisma.productMedia.findUnique({
    where: { productId_mediaId: { productId: params.productId, mediaId: ingested.mediaId } },
  })
  if (duplicate && duplicate.id !== link.id) {
    throw new Error('תמונה זו כבר קיימת בגלריית המוצר')
  }

  return prisma.productMedia.update({
    where: { id: link.id },
    data: { mediaId: ingested.mediaId },
  })
}

/** Deletes a library asset and its renditions once nothing references it. */
export async function deleteMediaAsset(mediaId: string): Promise<void> {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    include: { _count: { select: { productLinks: true } } },
  })
  if (!media) return
  if (media._count.productLinks > 0) {
    throw new Error('לא ניתן למחוק תמונה שמשויכת למוצרים')
  }

  const storage = getStorage()
  const variants = variantsFromJson(media.variants)
  await Promise.allSettled([
    storage.delete(media.storageKey),
    ...Object.values(variants).map((v) => storage.delete(v.key)),
  ])
  await prisma.media.delete({ where: { id: mediaId } })
}
