import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  ingestImage, attachMediaToProduct, setMainProductMedia, reorderProductMedia,
  detachMediaFromProduct, updateProductMediaAlt, deleteMediaAsset, replaceProductMedia,
} from '@/lib/media/service'
import { variantsFromJson, pickRendition } from '@/lib/media/renditions'
import { testDb, createTestProduct, cleanupTestData, uniqueSuffix } from '../helpers/db'

const UPLOAD_DIR = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? './.test-uploads')

// Hard guard: teardown removes this directory recursively, so refuse to run
// against anything other than the dedicated test storage root.
if (path.basename(UPLOAD_DIR) !== '.test-uploads') {
  throw new Error(`refusing to run media tests against ${UPLOAD_DIR} — set LOCAL_STORAGE_DIR to ./.test-uploads`)
}

async function samplePng(width = 800, height = 600, hue = 200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: hue % 255, g: 120, b: 180 } },
  }).png().toBuffer()
}

async function createdMediaIds(): Promise<string[]> {
  const rows = await testDb.media.findMany({ where: { folder: 'test-folder' }, select: { id: true } })
  return rows.map((r) => r.id)
}

describe('media pipeline', () => {
  beforeAll(async () => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
  })

  beforeEach(cleanupTestData)

  afterAll(async () => {
    await cleanupTestData()
    for (const id of await createdMediaIds()) {
      await testDb.productMedia.deleteMany({ where: { mediaId: id } })
      await testDb.media.delete({ where: { id } }).catch(() => undefined)
    }
    await fs.rm(UPLOAD_DIR, { recursive: true, force: true })
    await testDb.$disconnect()
  })

  it('stores the original plus every rendition and never base64 in the database', async () => {
    const result = await ingestImage({
      fileName: `photo-${uniqueSuffix()}.png`,
      buffer: await samplePng(),
      declaredMime: 'image/png',
      folder: 'test-folder',
    })

    const media = await testDb.media.findUniqueOrThrow({ where: { id: result.mediaId } })
    expect(media.width).toBe(800)
    expect(media.height).toBe(600)
    expect(media.fileSize).toBeGreaterThan(0)
    expect(media.url.startsWith('/media/')).toBe(true)
    expect(media.url).not.toMatch(/^data:/)

    const variants = variantsFromJson(media.variants)
    for (const name of ['thumbnail', 'card', 'page', 'zoom'] as const) {
      expect(variants[name]).toBeTruthy()
      const filePath = path.join(UPLOAD_DIR, variants[name]!.key)
      await expect(fs.access(filePath)).resolves.toBeUndefined()
    }

    // Renditions are letterboxed onto a square white canvas: the catalogue grid
    // stays uniform and the photo itself is never stretched.
    expect(variants.card!.width).toBe(600)
    expect(variants.card!.height).toBe(600)
    expect(variants.thumbnail!.width).toBeLessThanOrEqual(160)

    // The source dimensions are recorded untouched.
    expect(media.width).toBe(800)
    expect(media.height).toBe(600)
  })

  it('rejects a disguised non-image', async () => {
    await expect(
      ingestImage({ fileName: 'payload.png', buffer: Buffer.from('<svg xmlns="x"></svg>'.padEnd(64)), folder: 'test-folder' }),
    ).rejects.toThrow()
  })

  it('de-duplicates identical uploads', async () => {
    const buffer = await samplePng(400, 400, 90)
    const first = await ingestImage({ fileName: 'a.png', buffer, folder: 'test-folder' })
    const second = await ingestImage({ fileName: 'b.png', buffer, folder: 'test-folder' })
    expect(second.mediaId).toBe(first.mediaId)
    expect(second.deduplicated).toBe(true)
  })

  it('makes the first attached image the main image and keeps exactly one main', async () => {
    const product = await createTestProduct({ withMedia: false })
    const one = await ingestImage({ fileName: 'one.png', buffer: await samplePng(300, 300, 10), folder: 'test-folder' })
    const two = await ingestImage({ fileName: 'two.png', buffer: await samplePng(300, 300, 60), folder: 'test-folder' })

    const linkOne = await attachMediaToProduct(product.id, one.mediaId)
    const linkTwo = await attachMediaToProduct(product.id, two.mediaId)

    expect(linkOne.isMain).toBe(true)
    expect(linkTwo.isMain).toBe(false)

    await setMainProductMedia(product.id, linkTwo.id)
    const links = await testDb.productMedia.findMany({ where: { productId: product.id } })
    expect(links.filter((l) => l.isMain)).toHaveLength(1)
    expect(links.find((l) => l.isMain)!.id).toBe(linkTwo.id)
  })

  it('reorders, edits alt text, replaces and detaches images', async () => {
    const product = await createTestProduct({ withMedia: false })
    const links = []
    for (const hue of [10, 40, 70]) {
      const media = await ingestImage({ fileName: `m-${hue}.png`, buffer: await samplePng(300, 300, hue), folder: 'test-folder' })
      links.push(await attachMediaToProduct(product.id, media.mediaId))
    }

    const reversed = [links[2].id, links[1].id, links[0].id]
    await reorderProductMedia(product.id, reversed)
    const ordered = await testDb.productMedia.findMany({ where: { productId: product.id }, orderBy: { position: 'asc' } })
    expect(ordered.map((l) => l.id)).toEqual(reversed)

    await updateProductMediaAlt(product.id, links[0].id, 'תיאור נגיש')
    expect((await testDb.productMedia.findUniqueOrThrow({ where: { id: links[0].id } })).alt).toBe('תיאור נגיש')

    await replaceProductMedia({
      productId: product.id,
      productMediaId: links[0].id,
      fileName: 'replacement.png',
      buffer: await samplePng(300, 300, 200),
    })
    const replaced = await testDb.productMedia.findUniqueOrThrow({ where: { id: links[0].id } })
    expect(replaced.mediaId).not.toBe(links[0].mediaId)

    await detachMediaFromProduct(product.id, links[1].id)
    const after = await testDb.productMedia.findMany({ where: { productId: product.id }, orderBy: { position: 'asc' } })
    expect(after).toHaveLength(2)
    expect(after.map((l) => l.position)).toEqual([0, 1])
  })

  it('rejects a reorder list that does not match the product gallery', async () => {
    const product = await createTestProduct({ withMedia: false })
    const media = await ingestImage({ fileName: 'solo.png', buffer: await samplePng(300, 300, 33), folder: 'test-folder' })
    const link = await attachMediaToProduct(product.id, media.mediaId)
    await expect(reorderProductMedia(product.id, [link.id, 'not-a-real-id'])).rejects.toThrow()
  })

  it('refuses to delete a library asset that is still attached to a product', async () => {
    const product = await createTestProduct({ withMedia: false })
    const media = await ingestImage({ fileName: 'used.png', buffer: await samplePng(300, 300, 150), folder: 'test-folder' })
    await attachMediaToProduct(product.id, media.mediaId)
    await expect(deleteMediaAsset(media.mediaId)).rejects.toThrow(/משויכת למוצרים/)
  })

  it('falls back to the original URL when a rendition is missing', () => {
    expect(pickRendition(null, 'card', '/media/original.png')).toBe('/media/original.png')
  })
})

describe('local storage provider', () => {
  it('refuses path traversal in a storage key', async () => {
    const { LocalStorageProvider } = await import('@/lib/storage/local')
    const provider = new LocalStorageProvider(UPLOAD_DIR)
    for (const key of ['../../../etc/passwd', '../escape.webp', '..\\escape.webp', 'a/../../escape.webp']) {
      await expect(provider.read(key)).rejects.toThrow('נתיב קובץ אינו חוקי')
      await expect(provider.put({ key, body: Buffer.from('x'), mimeType: 'image/webp' })).rejects.toThrow('נתיב קובץ אינו חוקי')
    }

    // A legitimate nested key still works.
    await provider.put({ key: 'nested/dir/ok.webp', body: Buffer.from('x'), mimeType: 'image/webp' })
    expect(await provider.exists('nested/dir/ok.webp')).toBe(true)
  })

  it('builds URLs under the media route, not the build-time public folder', async () => {
    const { LocalStorageProvider } = await import('@/lib/storage/local')
    const provider = new LocalStorageProvider(UPLOAD_DIR)
    expect(provider.publicUrl('products/2026-09/abc/card.webp')).toBe('/media/products/2026-09/abc/card.webp')
  })
})
