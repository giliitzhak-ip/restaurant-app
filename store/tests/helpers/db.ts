import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required for integration tests')

export const testDb = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

let counter = 0

export function uniqueSuffix(): string {
  counter += 1
  return `${Date.now().toString(36)}${counter}`
}

/** Creates a fully publishable general product for tests. */
export async function createTestProduct(overrides: {
  name?: string
  price?: number | null
  stock?: number
  published?: boolean
  withMedia?: boolean
  kind?: 'GENERAL' | 'PEST_CONTROL'
  stockPolicy?: 'HIDE' | 'SHOW_UNAVAILABLE' | 'ALLOW_BACKORDER'
} = {}) {
  const suffix = uniqueSuffix()
  const product = await testDb.product.create({
    data: {
      slug: `test-product-${suffix}`,
      sku: `TEST-${suffix}`,
      name: overrides.name ?? `מוצר בדיקה ${suffix}`,
      kind: overrides.kind ?? 'GENERAL',
      price: overrides.price === undefined ? 4900 : overrides.price,
      status: overrides.published === false ? 'DRAFT' : 'PUBLISHED',
      published: overrides.published !== false,
      publishedAt: new Date(),
      stockPolicy: overrides.stockPolicy ?? 'SHOW_UNAVAILABLE',
      inventory: { create: { onHand: overrides.stock ?? 10, reserved: 0 } },
    },
  })

  if (overrides.withMedia !== false) {
    const media = await testDb.media.create({
      data: {
        storageKey: `test/${suffix}.webp`,
        url: `/media/test/${suffix}.webp`,
        mimeType: 'image/webp',
        fileSize: 1024,
        width: 800,
        height: 800,
      },
    })
    await testDb.productMedia.create({
      data: { productId: product.id, mediaId: media.id, position: 0, isMain: true },
    })
  }

  return product
}

export async function createTestCart(): Promise<string> {
  const token = `test-cart-${uniqueSuffix()}`
  await testDb.cart.create({ data: { token } })
  return token
}

export async function addTestCartItem(cartToken: string, productId: string, quantity: number, unitPrice: number) {
  const cart = await testDb.cart.findUniqueOrThrow({ where: { token: cartToken } })
  return testDb.cartItem.create({ data: { cartId: cart.id, productId, quantity, unitPrice } })
}

/** Removes everything a test created, in FK-safe order. */
export async function cleanupTestData(): Promise<void> {
  const orders = await testDb.order.findMany({ where: { email: { contains: '@test.local' } }, select: { id: true } })
  const orderIds = orders.map((o) => o.id)
  if (orderIds.length > 0) {
    await testDb.refund.deleteMany({ where: { orderId: { in: orderIds } } })
    await testDb.payment.deleteMany({ where: { orderId: { in: orderIds } } })
    await testDb.shipment.deleteMany({ where: { orderId: { in: orderIds } } })
    await testDb.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
    await testDb.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await testDb.order.deleteMany({ where: { id: { in: orderIds } } })
  }
  await testDb.customer.deleteMany({ where: { email: { contains: '@test.local' } } })
  await testDb.cart.deleteMany({ where: { token: { startsWith: 'test-cart-' } } })
  await testDb.inventoryMovement.deleteMany({ where: { product: { slug: { startsWith: 'test-product-' } } } })
  await testDb.productMedia.deleteMany({ where: { product: { slug: { startsWith: 'test-product-' } } } })
  await testDb.inventory.deleteMany({ where: { product: { slug: { startsWith: 'test-product-' } } } })
  await testDb.regulatoryRecord.deleteMany({ where: { product: { slug: { startsWith: 'test-product-' } } } })
  await testDb.product.deleteMany({ where: { slug: { startsWith: 'test-product-' } } })
  await testDb.media.deleteMany({ where: { storageKey: { startsWith: 'test/' } } })
  await testDb.webhookEvent.deleteMany({ where: { externalId: { startsWith: 'evt_test_' } } })
}
