import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { testDb, cleanupTestData } from '../helpers/db'

/**
 * Drives the built application over HTTP: the storefront, the admin guard,
 * the upload endpoint and the payment webhook.
 */
const PORT = 3123
const BASE = `http://127.0.0.1:${PORT}`

let server: ChildProcess

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

beforeAll(async () => {
  server = spawn('npx', ['next', 'start', '--port', String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'ignore',
  })
  await waitForServer()
}, 120_000)

afterAll(async () => {
  server?.kill('SIGTERM')
  await cleanupTestData()
  await testDb.$disconnect()
})

describe('storefront over HTTP', () => {
  it('serves the homepage with the brand hero', async () => {
    const response = await fetch(BASE)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('פתרונות חכמים')
    expect(html).toContain('lang="he"')
    expect(html).toContain('dir="rtl"')
  })

  it('sets the security headers on every response', async () => {
    const response = await fetch(BASE)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })

  it('serves a published product page with Product structured data', async () => {
    const product = await testDb.product.findFirst({
      where: { published: true, status: 'PUBLISHED' },
      select: { slug: true, name: true },
    })
    expect(product).toBeTruthy()

    const response = await fetch(`${BASE}/product/${product!.slug}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain(product!.name)
    expect(html).toContain('"@type":"Product"')
    expect(html).toContain('"@type":"BreadcrumbList"')
  })

  it('returns 404 for a product that is not published', async () => {
    const draft = await testDb.product.findFirst({ where: { published: false }, select: { slug: true } })
    expect(draft).toBeTruthy()
    const response = await fetch(`${BASE}/product/${draft!.slug}`)
    expect(response.status).toBe(404)
  })

  it('shows the empty state for a search with no results', async () => {
    const response = await fetch(`${BASE}/search?q=${encodeURIComponent('מוצרשלאקייםבכלל')}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('לא נמצאו תוצאות')
  })

  it('returns suggestions from the autocomplete endpoint', async () => {
    const response = await fetch(`${BASE}/api/search/suggest?q=${encodeURIComponent('אחסון')}`)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data.items)).toBe(true)
  })

  it('publishes robots.txt and a sitemap that excludes the admin', async () => {
    const robots = await fetch(`${BASE}/robots.txt`)
    expect(robots.status).toBe(200)
    expect(await robots.text()).toContain('/admin')

    const sitemap = await fetch(`${BASE}/sitemap.xml`)
    expect(sitemap.status).toBe(200)
    const xml = await sitemap.text()
    expect(xml).toContain('<urlset')
    expect(xml).not.toContain('/admin')
  })

  it('renders a friendly 404 page', async () => {
    const response = await fetch(`${BASE}/definitely-not-a-page`)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('העמוד לא נמצא')
  })
})

describe('admin access control over HTTP', () => {
  it('redirects an anonymous visitor away from the admin', async () => {
    const response = await fetch(`${BASE}/admin`, { redirect: 'manual' })
    expect([302, 307]).toContain(response.status)
    expect(response.headers.get('location')).toContain('/admin/login')
  })

  it('protects every admin section', async () => {
    for (const path of ['/admin/products', '/admin/media', '/admin/regulatory', '/admin/orders', '/admin/settings']) {
      const response = await fetch(`${BASE}${path}`, { redirect: 'manual' })
      expect([302, 307]).toContain(response.status)
    }
  })

  it('refuses an unauthenticated image upload', async () => {
    const body = new FormData()
    body.append('file', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'x.png')
    const response = await fetch(`${BASE}/api/admin/media/upload`, { method: 'POST', body, redirect: 'manual' })
    expect(response.status).not.toBe(200)
  })

  it('refuses an unauthenticated supplier import', async () => {
    const body = new FormData()
    body.append('supplierId', 'whatever')
    body.append('file', new Blob(['sku,cost\nA,1'], { type: 'text/csv' }), 'prices.csv')
    const response = await fetch(`${BASE}/api/admin/suppliers/import`, { method: 'POST', body, redirect: 'manual' })
    expect(response.status).not.toBe(200)
  })

  it('serves the admin login page', async () => {
    const response = await fetch(`${BASE}/admin/login`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('כניסה למערכת הניהול')
  })
})

describe('payment webhook over HTTP', () => {
  function sign(body: string): string {
    return crypto.createHmac('sha256', process.env.AUTH_SECRET!).update(body).digest('hex')
  }

  it('rejects an unsigned webhook', async () => {
    const response = await fetch(`${BASE}/api/webhooks/payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'evt_test_unsigned', ref: 'sbx_x', status: 'paid' }),
    })
    expect(response.status).toBe(401)
  })

  it('rejects a tampered payload', async () => {
    const original = JSON.stringify({ id: 'evt_test_tamper', ref: 'sbx_x', status: 'paid' })
    const tampered = JSON.stringify({ id: 'evt_test_tamper', ref: 'sbx_y', status: 'paid' })
    const response = await fetch(`${BASE}/api/webhooks/payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sandbox-signature': sign(original) },
      body: tampered,
    })
    expect(response.status).toBe(401)
  })

  it('accepts a correctly signed webhook and is idempotent', async () => {
    const body = JSON.stringify({ id: `evt_test_${Date.now()}`, ref: 'sbx_no_such_payment', status: 'paid' })
    const headers = { 'content-type': 'application/json', 'x-sandbox-signature': sign(body) }

    const first = await fetch(`${BASE}/api/webhooks/payment`, { method: 'POST', headers, body })
    expect(first.status).toBe(200)
    expect((await first.json()).applied).toBe(true)

    const second = await fetch(`${BASE}/api/webhooks/payment`, { method: 'POST', headers, body })
    expect((await second.json()).applied).toBe(false)
  })
})
