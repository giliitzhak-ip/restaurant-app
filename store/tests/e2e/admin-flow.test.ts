import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import sharp from 'sharp'
import { createSessionToken, ADMIN_SESSION_COOKIE } from '@/lib/auth/session'
import { testDb, cleanupTestData, createTestProduct } from '../helpers/db'

/**
 * Exercises the admin flows the product owner will actually use: opening the
 * product editor, uploading images, choosing a main image, and previewing a
 * bulk media import.
 */
const PORT = 3124
const BASE = `http://127.0.0.1:${PORT}`

let server: ChildProcess
let cookie: string

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('the server did not start in time')
}

async function png(hue: number): Promise<Blob> {
  const buffer = await sharp({
    create: { width: 700, height: 700, channels: 3, background: { r: hue % 255, g: 140, b: 200 } },
  }).png().toBuffer()
  return new Blob([new Uint8Array(buffer)], { type: 'image/png' })
}

beforeAll(async () => {
  server = spawn('npx', ['next', 'start', '--port', String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'ignore',
  })
  await waitForServer()

  const admin = await testDb.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })
  const token = await createSessionToken({ userId: admin.id, email: admin.email, name: admin.name, role: admin.role })
  cookie = `${ADMIN_SESSION_COOKIE}=${token}`
}, 120_000)

afterAll(async () => {
  server?.kill('SIGTERM')
  await cleanupTestData()
  await testDb.$disconnect()
})

describe('admin pages with a valid session', () => {
  it('opens the product list', async () => {
    const response = await fetch(`${BASE}/admin/products`, { headers: { cookie } })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('עריכה מהירה')
    expect(html).toContain('מוצרים')
  })

  it('opens the product editor with the image manager', async () => {
    const product = await testDb.product.findFirstOrThrow({ where: { brand: 'RPC' } })
    const response = await fetch(`${BASE}/admin/products/${product.id}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('תמונות המוצר')
    expect(html).toContain('גררו תמונות לכאן')
    expect(html).toContain('חסמי פרסום')
  })

  it('opens the regulatory dashboard and shows the products awaiting verification', async () => {
    const response = await fetch(`${BASE}/admin/regulatory`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('ממתין לאימות')
  })

  it('opens the simulator with its safety warnings', async () => {
    const response = await fetch(`${BASE}/admin/simulator`, { headers: { cookie } })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('סימולטור הזמנות ותפעול')
    expect(html).toContain('הסימולטור כותב נתונים אמיתיים למסד')
    expect(html).toContain('ENABLE_SIMULATOR')
  })

  it('opens the media library and the bulk import page', async () => {
    expect((await fetch(`${BASE}/admin/media`, { headers: { cookie } })).status).toBe(200)
    const importPage = await fetch(`${BASE}/admin/media/import`, { headers: { cookie } })
    expect(importPage.status).toBe(200)
    expect(await importPage.text()).toContain('RPC-001-main.jpg')
  })
})

describe('product image upload flow', () => {
  it('uploads images, makes the first one main and keeps the gallery ordered', async () => {
    const product = await createTestProduct({ withMedia: false })

    for (const hue of [20, 90]) {
      const body = new FormData()
      body.append('file', await png(hue), `shot-${hue}.png`)
      body.append('productId', product.id)
      const response = await fetch(`${BASE}/api/admin/media/upload`, { method: 'POST', headers: { cookie }, body })
      expect(response.status).toBe(200)
      expect((await response.json()).ok).toBe(true)
    }

    const links = await testDb.productMedia.findMany({
      where: { productId: product.id },
      orderBy: { position: 'asc' },
      include: { media: true },
    })
    expect(links).toHaveLength(2)
    expect(links[0].isMain).toBe(true)
    expect(links[1].isMain).toBe(false)
    expect(links.map((l) => l.position)).toEqual([0, 1])
    expect(links[0].media.url.startsWith('/media/')).toBe(true)
    expect(links[0].media.variants).toBeTruthy()
  })

  it('rejects a file that is not really an image', async () => {
    const product = await createTestProduct({ withMedia: false })
    const body = new FormData()
    body.append('file', new Blob(['<!DOCTYPE html><html></html>'.padEnd(64)], { type: 'image/png' }), 'evil.png')
    body.append('productId', product.id)

    const response = await fetch(`${BASE}/api/admin/media/upload`, { method: 'POST', headers: { cookie }, body })
    expect(response.status).toBe(400)
    expect(await testDb.productMedia.count({ where: { productId: product.id } })).toBe(0)
  })
})

describe('bulk media import preview', () => {
  it('matches filenames to products by SKU without writing anything', async () => {
    const product = await createTestProduct({ withMedia: false })
    const before = await testDb.productMedia.count({ where: { productId: product.id } })

    const response = await fetch(`${BASE}/api/admin/media/import`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ fileNames: [`${product.sku}-main.jpg`, `${product.sku}-2.jpg`, 'unknown-sku-9.jpg'] }),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    const matched = data.rows.filter((r: { productId: string | null }) => r.productId)
    expect(matched).toHaveLength(2)
    expect(matched[0].matchedBy).toBe('sku')
    expect(data.rows.find((r: { fileName: string }) => r.fileName === 'unknown-sku-9.jpg').productId).toBeNull()

    // The preview is read-only.
    expect(await testDb.productMedia.count({ where: { productId: product.id } })).toBe(before)
  })
})
