'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'
import {
  setMainProductMedia, reorderProductMedia, detachMediaFromProduct,
  updateProductMediaAlt, deleteMediaAsset,
} from '@/lib/media/service'

export interface MediaActionResult {
  ok: boolean
  error?: string
}

function failure(error: unknown): MediaActionResult {
  return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
}

export async function setMainImageAction(productId: string, productMediaId: string): Promise<MediaActionResult> {
  try {
    const session = await requireAdmin('media.upload')
    await setMainProductMedia(productId, productMediaId)
    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'media.set_main', entity: 'Product', entityId: productId, after: { productMediaId },
    })
    revalidatePath(`/admin/products/${productId}`)
    revalidatePath('/admin/products')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function reorderMediaAction(productId: string, orderedIds: string[]): Promise<MediaActionResult> {
  try {
    await requireAdmin('media.upload')
    await reorderProductMedia(productId, orderedIds)
    revalidatePath(`/admin/products/${productId}`)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function removeProductMediaAction(productId: string, productMediaId: string): Promise<MediaActionResult> {
  try {
    const session = await requireAdmin('media.delete')
    await detachMediaFromProduct(productId, productMediaId)
    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'media.detach', entity: 'Product', entityId: productId, before: { productMediaId },
    })
    revalidatePath(`/admin/products/${productId}`)
    revalidatePath('/admin/products')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function updateAltTextAction(productId: string, productMediaId: string, alt: string): Promise<MediaActionResult> {
  try {
    await requireAdmin('media.upload')
    await updateProductMediaAlt(productId, productMediaId, alt.slice(0, 200))
    revalidatePath(`/admin/products/${productId}`)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteMediaAssetAction(mediaId: string): Promise<MediaActionResult> {
  try {
    const session = await requireAdmin('media.delete')
    await deleteMediaAsset(mediaId)
    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'media.delete', entity: 'Media', entityId: mediaId,
    })
    revalidatePath('/admin/media')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}
