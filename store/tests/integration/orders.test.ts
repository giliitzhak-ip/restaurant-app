import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { placeOrder, applyPaymentResult, OutOfStockError } from '@/lib/orders/service'
import { testDb, createTestProduct, createTestCart, addTestCartItem, cleanupTestData, uniqueSuffix } from '../helpers/db'

const ADDRESS = {
  fullName: 'ישראל ישראלי',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '10',
}

function orderInput(cartToken: string, overrides: Record<string, unknown> = {}) {
  return {
    cartToken,
    email: `guest-${uniqueSuffix()}@test.local`,
    phone: '0501234567',
    shippingAddress: ADDRESS,
    shippingMethod: 'COURIER',
    shippingPrice: 2900,
    marketingOptIn: false,
    ...overrides,
  }
}

describe('order placement', () => {
  beforeEach(cleanupTestData)
  afterAll(async () => {
    await cleanupTestData()
    await testDb.$disconnect()
  })

  it('creates an order as a guest and reserves the stock', async () => {
    const product = await createTestProduct({ stock: 5, price: 4900 })
    const cart = await createTestCart()
    await addTestCartItem(cart, product.id, 2, 4900)

    const { order } = await placeOrder(orderInput(cart))

    expect(order.status).toBe('NEW')
    expect(order.subtotal).toBe(9800)
    expect(order.grandTotal).toBe(9800 + 2900)

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { productId: product.id } })
    expect(inventory.onHand).toBe(5)
    expect(inventory.reserved).toBe(2)

    // The cart is emptied so a refresh cannot re-submit it.
    const remaining = await testDb.cartItem.count({ where: { cart: { token: cart } } })
    expect(remaining).toBe(0)
  })

  it('refuses to oversell beyond the available quantity', async () => {
    const product = await createTestProduct({ stock: 1 })
    const cart = await createTestCart()
    await addTestCartItem(cart, product.id, 3, 4900)

    await expect(placeOrder(orderInput(cart))).rejects.toThrow(OutOfStockError)

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { productId: product.id } })
    expect(inventory.reserved).toBe(0)
    expect(await testDb.order.count({ where: { email: { contains: '@test.local' } } })).toBe(0)
  })

  it('does not oversell when two checkouts race for the last unit', async () => {
    const product = await createTestProduct({ stock: 1 })
    const cartA = await createTestCart()
    const cartB = await createTestCart()
    await addTestCartItem(cartA, product.id, 1, 4900)
    await addTestCartItem(cartB, product.id, 1, 4900)

    const results = await Promise.allSettled([
      placeOrder(orderInput(cartA)),
      placeOrder(orderInput(cartB)),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled).toHaveLength(1)

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { productId: product.id } })
    expect(inventory.reserved).toBe(1)
    expect(inventory.onHand - inventory.reserved).toBe(0)
  })

  it('refuses to sell an unpublished product', async () => {
    const product = await createTestProduct({ published: false })
    const cart = await createTestCart()
    await addTestCartItem(cart, product.id, 1, 4900)

    await expect(placeOrder(orderInput(cart))).rejects.toThrow(/אינו זמין לרכישה/)
  })

  it('refuses an empty cart', async () => {
    const cart = await createTestCart()
    await expect(placeOrder(orderInput(cart))).rejects.toThrow(/העגלה ריקה/)
  })

  it('records a payment row without any card data', async () => {
    const product = await createTestProduct({ stock: 3 })
    const cart = await createTestCart()
    await addTestCartItem(cart, product.id, 1, 4900)

    const { order } = await placeOrder(orderInput(cart))
    const payment = await testDb.payment.findFirstOrThrow({ where: { orderId: order.id } })

    expect(payment.status).toBe('PENDING')
    expect(payment.amount).toBe(order.grandTotal)
    expect(JSON.stringify(payment)).not.toMatch(/cvv|cardNumber|pan/i)
  })
})

describe('payment results', () => {
  beforeEach(cleanupTestData)
  afterAll(async () => {
    await cleanupTestData()
    await testDb.$disconnect()
  })

  async function placedOrder(stock = 5, quantity = 2) {
    const product = await createTestProduct({ stock })
    const cart = await createTestCart()
    await addTestCartItem(cart, product.id, quantity, 4900)
    const { order } = await placeOrder(orderInput(cart))
    const payment = await testDb.payment.findFirstOrThrow({ where: { orderId: order.id } })
    return { product, order, payment }
  }

  it('turns a successful payment into a sale', async () => {
    const { product, order, payment } = await placedOrder(5, 2)

    const result = await applyPaymentResult({
      provider: 'sandbox',
      externalId: `evt_test_${uniqueSuffix()}`,
      providerRef: payment.providerRef!,
      status: 'PAID',
      payloadHash: 'hash',
    })
    expect(result.applied).toBe(true)

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(updated.status).toBe('PAID')

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { productId: product.id } })
    expect(inventory.onHand).toBe(3)
    expect(inventory.reserved).toBe(0)
  })

  it('ignores a duplicate webhook delivery', async () => {
    const { product, order, payment } = await placedOrder(5, 2)
    const externalId = `evt_test_${uniqueSuffix()}`

    const first = await applyPaymentResult({ provider: 'sandbox', externalId, providerRef: payment.providerRef!, status: 'PAID', payloadHash: 'h' })
    const second = await applyPaymentResult({ provider: 'sandbox', externalId, providerRef: payment.providerRef!, status: 'PAID', payloadHash: 'h' })

    expect(first.applied).toBe(true)
    expect(second.applied).toBe(false)

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { productId: product.id } })
    // Stock decremented exactly once, not twice.
    expect(inventory.onHand).toBe(3)

    const movements = await testDb.inventoryMovement.count({ where: { productId: product.id, type: 'SALE' } })
    expect(movements).toBe(1)

    const events = await testDb.orderEvent.count({ where: { orderId: order.id, type: 'PAID' } })
    expect(events).toBe(1)
  })

  it('releases the reservation when the payment fails', async () => {
    const { product, order, payment } = await placedOrder(5, 2)

    await applyPaymentResult({
      provider: 'sandbox',
      externalId: `evt_test_${uniqueSuffix()}`,
      providerRef: payment.providerRef!,
      status: 'FAILED',
      payloadHash: 'h',
    })

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { productId: product.id } })
    expect(inventory.onHand).toBe(5)
    expect(inventory.reserved).toBe(0)

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(updated.status).toBe('NEW')
  })
})
