import { describe, expect, it } from 'vitest'
import { sniffImageMime, validateImageUpload } from '@/lib/media/validation'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)])
const WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64, 1),
])
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(64, 1)])

describe('image upload validation', () => {
  it('detects the real type from the file header', () => {
    expect(sniffImageMime(PNG).mimeType).toBe('image/png')
    expect(sniffImageMime(JPEG).mimeType).toBe('image/jpeg')
    expect(sniffImageMime(WEBP).mimeType).toBe('image/webp')
    expect(sniffImageMime(AVIF).mimeType).toBe('image/avif')
  })

  it('rejects SVG, HTML and executables regardless of extension', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'.padEnd(64))
    const html = Buffer.from('<!DOCTYPE html><html><body>x</body></html>'.padEnd(64))
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0)])

    expect(sniffImageMime(svg).mimeType).toBeNull()
    expect(sniffImageMime(html).mimeType).toBeNull()
    expect(sniffImageMime(exe).mimeType).toBeNull()

    const result = validateImageUpload({ fileName: 'payload.png', buffer: svg, maxBytes: 1024 * 1024 })
    expect(result.ok).toBe(false)
  })

  it('does not trust the extension alone', () => {
    const html = Buffer.from('<!DOCTYPE html><html><body>x</body></html>'.padEnd(64))
    const result = validateImageUpload({ fileName: 'nice.jpg', buffer: html, declaredMime: 'image/jpeg', maxBytes: 1024 * 1024 })
    expect(result.ok).toBe(false)
  })

  it('rejects a mismatch between declared type and content', () => {
    const result = validateImageUpload({ fileName: 'photo.png', buffer: JPEG, declaredMime: 'image/png', maxBytes: 1024 * 1024 })
    expect(result.ok).toBe(false)
  })

  it('enforces the maximum size', () => {
    const result = validateImageUpload({ fileName: 'photo.png', buffer: PNG, maxBytes: 8 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('גדול מהמותר')
  })

  it('accepts a valid PNG', () => {
    const result = validateImageUpload({ fileName: 'photo.png', buffer: PNG, declaredMime: 'image/png', maxBytes: 1024 * 1024 })
    expect(result.ok).toBe(true)
  })

  it('rejects an unsupported extension', () => {
    const result = validateImageUpload({ fileName: 'photo.gif', buffer: PNG, maxBytes: 1024 * 1024 })
    expect(result.ok).toBe(false)
  })
})
