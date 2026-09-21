import { prisma } from '@/lib/db'
import type { ProductStatus } from '@/generated/prisma/enums'
import { evaluatePublish, canTransition, type PublishDecision } from './publish-guard'

/** Loads exactly what the publish guard needs to make its decision. */
export async function publishDecisionFor(productId: string): Promise<PublishDecision & { product: { name: string; status: ProductStatus } }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      name: true, kind: true, status: true, price: true,
      regulatory: {
        select: {
          status: true, publicUseAllowed: true, registrationNumber: true,
          labelVerifiedAt: true, expiresAt: true,
        },
      },
      _count: { select: { media: true } },
    },
  })
  if (!product) throw new Error('המוצר לא נמצא')

  const decision = evaluatePublish({
    name: product.name,
    kind: product.kind,
    status: product.status,
    price: product.price,
    mediaCount: product._count.media,
    regulatory: product.regulatory,
  })

  return { ...decision, product: { name: product.name, status: product.status } }
}

export interface StatusChangeResult {
  ok: boolean
  error?: string
  blockers?: string[]
}

/**
 * The only path that may flip `published`. Publishing is refused unless the
 * guard clears it, regardless of what the UI sent.
 */
export async function changeProductStatus(productId: string, target: ProductStatus): Promise<StatusChangeResult> {
  const current = await prisma.product.findUnique({ where: { id: productId }, select: { status: true } })
  if (!current) return { ok: false, error: 'המוצר לא נמצא' }

  if (!canTransition(current.status, target)) {
    return { ok: false, error: 'מעבר סטטוס זה אינו מותר' }
  }

  if (target === 'PUBLISHED') {
    const decision = await publishDecisionFor(productId)
    if (!decision.allowed) {
      return { ok: false, error: 'לא ניתן לפרסם את המוצר', blockers: decision.blockers }
    }
    await prisma.product.update({
      where: { id: productId },
      data: { status: 'PUBLISHED', published: true, publishedAt: new Date() },
    })
    return { ok: true }
  }

  await prisma.product.update({
    where: { id: productId },
    data: { status: target, published: false },
  })
  return { ok: true }
}
