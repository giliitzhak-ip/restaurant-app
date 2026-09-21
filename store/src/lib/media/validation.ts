/**
 * Server-side upload validation. The file extension and the browser-supplied
 * Content-Type are both attacker-controlled, so the real check is the magic
 * number at the head of the buffer.
 */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number]

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'] as const

export const MAX_IMAGE_DIMENSION = 8000
export const MIN_IMAGE_DIMENSION = 50

export interface SniffResult {
  mimeType: AllowedImageMime | null
  reason?: string
}

/** Detects the true image type from the file header. */
export function sniffImageMime(buffer: Buffer): SniffResult {
  if (buffer.length < 12) return { mimeType: null, reason: 'הקובץ קצר מכדי להיות תמונה תקינה' }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mimeType: 'image/jpeg' }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png' }
  }

  // RIFF....WEBP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mimeType: 'image/webp' }
  }

  // ISO-BMFF branded ftyp box: AVIF / AVIS
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase()
    if (brand === 'avif' || brand === 'avis') return { mimeType: 'image/avif' }
    return { mimeType: null, reason: 'פורמט הווידאו/תמונה אינו נתמך' }
  }

  const head = buffer.toString('ascii', 0, 256).toLowerCase()
  if (head.includes('<svg') || head.includes('<?xml')) {
    return { mimeType: null, reason: 'קבצי SVG אינם נתמכים מטעמי אבטחה' }
  }
  if (head.includes('<html') || head.includes('<!doctype')) {
    return { mimeType: null, reason: 'קבצי HTML אינם ניתנים להעלאה' }
  }
  if (head.startsWith('mz') || head.startsWith('\x7felf')) {
    return { mimeType: null, reason: 'קבצי הרצה אינם ניתנים להעלאה' }
  }
  return { mimeType: null, reason: 'סוג הקובץ אינו נתמך. ניתן להעלות JPG, PNG, WEBP או AVIF' }
}

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase()
}

export function extensionForMime(mime: AllowedImageMime): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/avif': return 'avif'
  }
}

export interface ValidationFailure {
  ok: false
  error: string
}
export interface ValidationSuccess {
  ok: true
  mimeType: AllowedImageMime
}
export type ValidationResult = ValidationSuccess | ValidationFailure

export interface ValidateInput {
  fileName: string
  buffer: Buffer
  declaredMime?: string
  maxBytes: number
}

export function validateImageUpload({ fileName, buffer, declaredMime, maxBytes }: ValidateInput): ValidationResult {
  if (buffer.byteLength === 0) return { ok: false, error: 'הקובץ ריק' }
  if (buffer.byteLength > maxBytes) {
    return { ok: false, error: `הקובץ גדול מהמותר (${Math.round(maxBytes / (1024 * 1024))}MB)` }
  }

  const ext = extensionOf(fileName)
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return { ok: false, error: `סיומת ${ext || 'לא ידועה'} אינה נתמכת` }
  }

  const sniffed = sniffImageMime(buffer)
  if (!sniffed.mimeType) return { ok: false, error: sniffed.reason ?? 'סוג הקובץ אינו נתמך' }

  if (declaredMime && declaredMime !== sniffed.mimeType && !(declaredMime === 'image/jpg' && sniffed.mimeType === 'image/jpeg')) {
    return { ok: false, error: 'תוכן הקובץ אינו תואם את סוג הקובץ המוצהר' }
  }

  return { ok: true, mimeType: sniffed.mimeType }
}
