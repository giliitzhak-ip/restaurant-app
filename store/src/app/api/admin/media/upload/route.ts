import { NextResponse } from 'next/server'
import { requireAdmin, ForbiddenError } from '@/lib/auth/guard'
import { ingestImage, attachMediaToProduct, replaceProductMedia, maxUploadBytes } from '@/lib/media/service'
import { recordAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/auth/rate-limit'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Multipart image upload. A route handler rather than a server action so the
 * browser can report real upload progress through XHR.
 */
export async function POST(request: Request) {
  let session
  try {
    session = await requireAdmin('media.upload')
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 401
    return NextResponse.json({ error: error instanceof Error ? error.message : 'לא מורשה' }, { status })
  }

  if (!rateLimit(`upload:${session.userId}`, 120, 60).allowed) {
    return NextResponse.json({ error: 'יותר מדי העלאות. המתינו רגע ונסו שוב.' }, { status: 429 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > maxUploadBytes() + 1024 * 64) {
    return NextResponse.json({ error: 'הקובץ גדול מהמותר' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את הקובץ' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא נשלח קובץ' }, { status: 400 })
  }

  const productId = typeof form.get('productId') === 'string' ? String(form.get('productId')) : null
  const replaceId = typeof form.get('replaceProductMediaId') === 'string' ? String(form.get('replaceProductMediaId')) : null
  const alt = typeof form.get('alt') === 'string' ? String(form.get('alt')) : null

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    if (replaceId && productId) {
      const link = await replaceProductMedia({
        productId,
        productMediaId: replaceId,
        fileName: file.name,
        buffer,
        declaredMime: file.type,
      })
      await recordAudit({
        userId: session.userId, actorEmail: session.email,
        action: 'media.replace', entity: 'Product', entityId: productId, after: { productMediaId: link.id },
      })
      return NextResponse.json({ ok: true, productMediaId: link.id })
    }

    const media = await ingestImage({
      fileName: file.name,
      buffer,
      declaredMime: file.type,
      alt,
      folder: productId ? 'products' : 'library',
    })

    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } })
      if (!product) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 })
      await attachMediaToProduct(productId, media.mediaId, alt)
      await recordAudit({
        userId: session.userId, actorEmail: session.email,
        action: 'media.upload', entity: 'Product', entityId: productId, after: { mediaId: media.mediaId },
      })
    } else {
      await recordAudit({
        userId: session.userId, actorEmail: session.email,
        action: 'media.upload', entity: 'Media', entityId: media.mediaId,
      })
    }

    return NextResponse.json({
      ok: true,
      mediaId: media.mediaId,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      deduplicated: media.deduplicated,
      fileName: file.name,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'ההעלאה נכשלה' },
      { status: 400 },
    )
  }
}
