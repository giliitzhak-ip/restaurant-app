'use server'

import { revalidatePath } from 'next/cache'
import { addToCart, removeCartItem, setSavedForLater, updateCartQuantity } from '@/lib/cart/service'

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown): ActionResult {
  const message = error instanceof Error ? error.message : 'אירעה שגיאה. נסו שוב.'
  return { ok: false, error: message }
}

export async function addToCartAction(productId: string, quantity: number): Promise<ActionResult> {
  try {
    await addToCart(productId, Math.max(1, Math.min(99, Math.round(quantity))))
    revalidatePath('/cart')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateCartQuantityAction(itemId: string, quantity: number): Promise<ActionResult> {
  try {
    await updateCartQuantity(itemId, Math.min(99, Math.round(quantity)))
    revalidatePath('/cart')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function removeCartItemAction(itemId: string): Promise<ActionResult> {
  try {
    await removeCartItem(itemId)
    revalidatePath('/cart')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setSavedForLaterAction(itemId: string, saved: boolean): Promise<ActionResult> {
  try {
    await setSavedForLater(itemId, saved)
    revalidatePath('/cart')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
