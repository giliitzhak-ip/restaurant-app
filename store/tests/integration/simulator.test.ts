import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runSimulation } from '@/lib/simulator/engine'
import { purgeSimulatedData, summariseSimulatedData } from '@/lib/simulator/purge'
import { placeOrder } from '@/lib/orders/service'
import {
  testDb, createTestProduct, createTestCart, addTestCartItem, cleanupTestData, uniqueSuffix,
} from '../helpers/db'

async function stockOf(productId: string) {
  const inventory = await testDb.inventory.findUniqueOrThrow({ where: { productId } })
  return { onHand: inventory.onHand, reserved: inventory.reserved }
}

/**
 * The simulator buys from the whole published catalogue, not only the product a
 * test created, so stock effects are asserted against catalogue totals.
 */
async function totalStock() {
  const totals = await testDb.inventory.aggregate({ _sum: { onHand: true, reserved: true } })
  return { onHand: totals._sum.onHand ?? 0, reserved: totals._sum.reserved ?? 0 }
}

/** Removes simulator output plus anything the test helpers created. */
async function fullCleanup() {
  await purgeSimulatedData()
  await cleanupTestData()
}

describe('operations simulator', () => {
  beforeEach(fullCleanup)
  afterAll(async () => {
    await fullCleanup()
    await testDb.$disconnect()
  })

  it('reports clearly when there is nothing sellable', async () => {
    // Everything published is hidden by giving the catalogue no priced product.
    await testDb.product.updateMany({ where: { published: true }, data: { published: false } })
    try {
      const report = await runSimulation({ count: 3, spreadDays: 0, seed: 1 })
      expect(report.created).toBe(0)
      expect(report.warnings.join(' ')).toContain('אין מוצרים מפורסמים')
    } finally {
      await testDb.product.updateMany({ where: { status: 'PUBLISHED' }, data: { published: true } })
    }
  })

  it('is reproducible for the same seed', async () => {
    await createTestProduct({ stock: 500 })
    const first = await runSimulation({ count: 8, spreadDays: 10, seed: 4242 })
    await purgeSimulatedData()
    const second = await runSimulation({ count: 8, spreadDays: 10, seed: 4242 })

    expect(second.byScenario).toEqual(first.byScenario)
    expect(second.outcomes.map((o) => o.scenario)).toEqual(first.outcomes.map((o) => o.scenario))
  })

  it('flags everything it creates as simulated', async () => {
    await createTestProduct({ stock: 200 })
    await runSimulation({ count: 6, spreadDays: 5, seed: 11 })

    const orders = await testDb.order.findMany({ where: { isSimulated: false }, select: { id: true } })
    expect(orders).toHaveLength(0)

    const customers = await testDb.customer.count({ where: { isSimulated: true } })
    expect(customers).toBeGreaterThan(0)
  })

  it('spreads activity backwards over the requested window', async () => {
    await createTestProduct({ stock: 200 })
    await runSimulation({ count: 12, spreadDays: 20, seed: 77 })

    const orders = await testDb.order.findMany({ where: { isSimulated: true }, select: { createdAt: true } })
    const oldest = Math.min(...orders.map((o) => o.createdAt.getTime()))
    const ageDays = (Date.now() - oldest) / 86_400_000

    expect(orders.length).toBeGreaterThan(0)
    expect(ageDays).toBeLessThanOrEqual(21)
    expect(orders.every((o) => o.createdAt.getTime() <= Date.now())).toBe(true)
  })

  it('completes the happy path and consumes stock', async () => {
    await createTestProduct({ stock: 50 })
    const before = await totalStock()

    const report = await runSimulation({ count: 3, spreadDays: 0, scenarios: ['HAPPY_PATH'], seed: 9 })
    expect(report.created).toBe(3)

    const delivered = await testDb.order.count({ where: { isSimulated: true, status: 'DELIVERED' } })
    expect(delivered).toBe(3)

    const after = await totalStock()
    expect(after.onHand).toBeLessThan(before.onHand)
    expect(after.reserved).toBe(before.reserved)

    const sales = await testDb.inventoryMovement.count({ where: { type: 'SALE' } })
    expect(sales).toBeGreaterThan(0)
  })

  it('leaves an unpaid order holding a reservation', async () => {
    await createTestProduct({ stock: 50 })
    const before = await totalStock()

    await runSimulation({ count: 2, spreadDays: 0, scenarios: ['AWAITING_PAYMENT'], seed: 3 })

    const after = await totalStock()
    expect(after.reserved).toBeGreaterThan(before.reserved)
    expect(after.onHand).toBe(before.onHand)
    expect(await testDb.order.count({ where: { isSimulated: true, status: 'NEW' } })).toBe(2)
  })

  it('releases the reservation when a simulated payment fails', async () => {
    await createTestProduct({ stock: 50 })
    const before = await totalStock()

    await runSimulation({ count: 3, spreadDays: 0, scenarios: ['PAYMENT_FAILED'], seed: 3 })

    expect(await totalStock()).toEqual(before)
    expect(await testDb.payment.count({ where: { status: 'FAILED' } })).toBe(3)
  })

  it('records refunds against paid orders', async () => {
    await createTestProduct({ stock: 100 })
    const report = await runSimulation({ count: 4, spreadDays: 0, scenarios: ['REFUNDED'], seed: 21 })

    expect(report.failed).toBe(0)
    expect(await testDb.refund.count()).toBe(4)
    const payments = await testDb.payment.findMany({ select: { status: true } })
    expect(payments.every((p) => p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED')).toBe(true)
  })

  it('creates abandoned carts without orders or reservations', async () => {
    await createTestProduct({ stock: 50 })
    const before = await totalStock()

    await runSimulation({ count: 3, spreadDays: 0, scenarios: ['ABANDONED_CART'], seed: 6 })

    expect(await testDb.order.count({ where: { isSimulated: true } })).toBe(0)
    expect(await testDb.cart.count({ where: { token: { startsWith: 'sim-' } } })).toBe(3)
    expect(await totalStock()).toEqual(before)
  })

  it('proves the system rejects an attempt to oversell', async () => {
    await createTestProduct({ stock: 2 })
    const before = await totalStock()

    const report = await runSimulation({ count: 3, spreadDays: 0, scenarios: ['OUT_OF_STOCK'], seed: 8 })

    // ok:true means "the guard behaved correctly and refused the order".
    expect(report.outcomes.every((o) => o.ok)).toBe(true)
    expect(report.outcomes.every((o) => !o.detail.startsWith('אזהרה'))).toBe(true)
    expect(await testDb.order.count({ where: { isSimulated: true } })).toBe(0)
    expect(await totalStock()).toEqual(before)
  })

  it('summarises what is currently simulated', async () => {
    await createTestProduct({ stock: 100 })
    await runSimulation({ count: 4, spreadDays: 0, scenarios: ['HAPPY_PATH'], seed: 12 })

    const summary = await summariseSimulatedData()
    expect(summary.orders).toBe(4)
    expect(summary.customers).toBe(4)
    expect(summary.revenue).toBeGreaterThan(0)
  })
})

describe('purging simulated data', () => {
  beforeEach(fullCleanup)
  afterAll(async () => {
    await fullCleanup()
    await testDb.$disconnect()
  })

  it('restores inventory to exactly where it started', async () => {
    await createTestProduct({ stock: 120 })
    const before = await totalStock()

    await runSimulation({ count: 15, spreadDays: 10, seed: 314 })
    const during = await totalStock()
    expect(during).not.toEqual(before)

    await purgeSimulatedData()
    expect(await totalStock()).toEqual(before)
  })

  it('removes every trace of the simulation', async () => {
    await createTestProduct({ stock: 100 })
    await runSimulation({ count: 10, spreadDays: 5, seed: 55 })
    await purgeSimulatedData()

    expect(await testDb.order.count({ where: { isSimulated: true } })).toBe(0)
    expect(await testDb.customer.count({ where: { isSimulated: true } })).toBe(0)
    expect(await testDb.cart.count({ where: { token: { startsWith: 'sim-' } } })).toBe(0)
    expect(await testDb.payment.count()).toBe(0)
    expect(await testDb.refund.count()).toBe(0)
    expect(await testDb.shipment.count()).toBe(0)
  })

  it('never touches a real order', async () => {
    const product = await createTestProduct({ stock: 100 })

    // A genuine customer order placed through the normal flow.
    const cart = await createTestCart()
    await addTestCartItem(cart, product.id, 2, 4900)
    const { order: realOrder } = await placeOrder({
      cartToken: cart,
      email: `real-${uniqueSuffix()}@test.local`,
      phone: '0501234567',
      shippingAddress: { fullName: 'לקוח אמיתי', city: 'חיפה', street: 'הרצל', houseNumber: '1' },
      shippingMethod: 'COURIER',
      shippingPrice: 2900,
      marketingOptIn: false,
      notify: false,
    })
    const realStockAfterOrder = await stockOf(product.id)

    await runSimulation({ count: 8, spreadDays: 5, seed: 404 })
    await purgeSimulatedData()

    const survivor = await testDb.order.findUnique({
      where: { id: realOrder.id },
      include: { items: true, payments: true },
    })
    expect(survivor).not.toBeNull()
    expect(survivor!.isSimulated).toBe(false)
    expect(survivor!.items).toHaveLength(1)
    expect(survivor!.payments).toHaveLength(1)

    // The real order's reservation is still held.
    expect(await stockOf(product.id)).toEqual(realStockAfterOrder)
  })
})
