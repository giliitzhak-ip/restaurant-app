import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { PUBLIC_PRODUCT_WHERE } from '@/lib/catalog/queries'
import { pickRendition } from '@/lib/media/renditions'
import { effectivePrice, vatFromGross } from '@/lib/money'
import { getSetting } from '@/lib/settings'
import { isProduction } from '@/lib/env'

export const CART_COOKIE = 'cart_token'
const CART_TTL_DAYS = 60

export interface CartLine {
  id: string
  productId: string
  slug: string
  name: string
  imageUrl: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  savedForLater: boolean
  maxQuantity: number | null
}

export interface CartTotals {
  subtotal: number
  discount: number
  shipping: number
  vat: number
  total: number
  freeShippingThreshold: number
  remainingForFreeShipping: number
}

export interface CartView {
  id: string | null
  lines: CartLine[]
  savedLines: CartLine[]
  totals: CartTotals
  couponCode: string | null
  itemCount: number
}

async function readCartToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(CART_COOKIE)?.value ?? null
}

/** Creates the cart cookie lazily — browsing never issues one. */
export async function ensureCart(): Promise<string> {
  const store = await cookies()
  const existing = store.get(CART_COOKIE)?.value
  if (existing) {
    const found = await prisma.cart.findUnique({ where: { token: existing }, select: { id: true } })
    if (found) return existing
  }
  const token = randomUUID()
  await prisma.cart.create({
    data: {
      token,
      expiresAt: new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  })
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: CART_TTL_DAYS * 24 * 60 * 60,
  })
  return token
}

const EMPTY_TOTALS: CartTotals = {
  subtotal: 0, discount: 0, shipping: 0, vat: 0, total: 0,
  freeShippingThreshold: 0, remainingForFreeShipping: 0,
}

export async function getCart(): Promise<CartView> {
  const token = await readCartToken()
  const threshold = (await getSetting('cart.freeShippingThreshold')) as number
  if (!token) {
    return { id: null, lines: [], savedLines: [], totals: { ...EMPTY_TOTALS, freeShippingThreshold: threshold, remainingForFreeShipping: threshold }, couponCode: null, itemCount: 0 }
  }

  const cart = await prisma.cart.findUnique({
    where: { token },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: {
            select: {
              id: true, slug: true, name: true, price: true, salePrice: true,
              stockPolicy: true, published: true, status: true,
              inventory: { select: { onHand: true, reserved: true } },
              media: {
                orderBy: [{ isMain: 'desc' }, { position: 'asc' }],
                take: 1,
                select: { media: { select: { url: true, variants: true } } },
              },
            },
          },
        },
      },
    },
  })

  if (!cart) {
    return { id: null, lines: [], savedLines: [], totals: { ...EMPTY_TOTALS, freeShippingThreshold: threshold, remainingForFreeShipping: threshold }, couponCode: null, itemCount: 0 }
  }

  const toLine = (item: (typeof cart.items)[number]): CartLine => {
    const price = effectivePrice(item.product.price, item.product.salePrice) ?? item.unitPrice
    const available = (item.product.inventory?.onHand ?? 0) - (item.product.inventory?.reserved ?? 0)
    const link = item.product.media[0]
    return {
      id: item.id,
      productId: item.productId,
      slug: item.product.slug,
      name: item.product.name,
      imageUrl: link ? pickRendition(link.media.variants, 'thumbnail', link.media.url) : null,
      unitPrice: price,
      quantity: item.quantity,
      lineTotal: price * item.quantity,
      savedForLater: item.savedForLater,
      maxQuantity: item.product.stockPolicy === 'ALLOW_BACKORDER' ? null : Math.max(0, available),
    }
  }

  const all = cart.items.map(toLine)
  const lines = all.filter((l) => !l.savedForLater)
  const savedLines = all.filter((l) => l.savedForLater)

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0)
  const vatRateBp = (await getSetting('tax.vatRateBp')) as number
  const remaining = Math.max(0, threshold - subtotal)

  return {
    id: cart.id,
    lines,
    savedLines,
    couponCode: cart.couponCode,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    totals: {
      subtotal,
      discount: 0,
      shipping: 0,
      vat: vatFromGross(subtotal, vatRateBp),
      total: subtotal,
      freeShippingThreshold: threshold,
      remainingForFreeShipping: remaining,
    },
  }
}

export async function addToCart(productId: string, quantity = 1): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { ...PUBLIC_PRODUCT_WHERE, id: productId },
    select: { id: true, price: true, salePrice: true },
  })
  if (!product) throw new Error('המוצר אינו זמין לרכישה')

  const price = effectivePrice(product.price, product.salePrice)
  if (price === null) throw new Error('למוצר אין מחיר')

  const token = await ensureCart()
  const cart = await prisma.cart.findUniqueOrThrow({ where: { token } })

  const existing = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, variantId: null },
  })

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity, unitPrice: price, savedForLater: false },
    })
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, quantity, unitPrice: price },
    })
  }
}

async function ownedItem(itemId: string) {
  const token = await readCartToken()
  if (!token) throw new Error('העגלה לא נמצאה')
  const item = await prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } })
  if (!item || item.cart.token !== token) throw new Error('הפריט לא נמצא בעגלה')
  return item
}

export async function updateCartQuantity(itemId: string, quantity: number): Promise<void> {
  const item = await ownedItem(itemId)
  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } })
    return
  }
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } })
}

export async function removeCartItem(itemId: string): Promise<void> {
  const item = await ownedItem(itemId)
  await prisma.cartItem.delete({ where: { id: item.id } })
}

export async function setSavedForLater(itemId: string, saved: boolean): Promise<void> {
  const item = await ownedItem(itemId)
  await prisma.cartItem.update({ where: { id: item.id }, data: { savedForLater: saved } })
}

/** Moves a guest cart onto a customer account after login. */
export async function mergeGuestCart(customerId: string): Promise<void> {
  const token = await readCartToken()
  if (!token) return
  const guest = await prisma.cart.findUnique({ where: { token }, include: { items: true } })
  if (!guest) return

  const existing = await prisma.cart.findFirst({
    where: { customerId },
    include: { items: true },
    orderBy: { updatedAt: 'desc' },
  })

  if (!existing) {
    await prisma.cart.update({ where: { id: guest.id }, data: { customerId } })
    return
  }

  await prisma.$transaction(async (tx) => {
    for (const item of guest.items) {
      const match = existing.items.find((i) => i.productId === item.productId && i.variantId === item.variantId)
      if (match) {
        await tx.cartItem.update({ where: { id: match.id }, data: { quantity: match.quantity + item.quantity } })
      } else {
        await tx.cartItem.create({
          data: {
            cartId: existing.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          },
        })
      }
    }
    await tx.cart.delete({ where: { id: guest.id } })
  })
}
