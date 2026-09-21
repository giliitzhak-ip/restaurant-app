import { prisma } from '@/lib/db'
import { SIMULATION_EMAIL_DOMAIN } from './random'

export interface SimulationSummary {
  orders: number
  customers: number
  carts: number
  revenue: number
}

export async function summariseSimulatedData(): Promise<SimulationSummary> {
  const [orders, customers, carts, revenue] = await Promise.all([
    prisma.order.count({ where: { isSimulated: true } }),
    prisma.customer.count({ where: { isSimulated: true } }),
    prisma.cart.count({ where: { token: { startsWith: 'sim-' } } }),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: { isSimulated: true, status: { in: ['PAID', 'PROCESSING', 'PACKING', 'READY_FOR_SHIPPING', 'SHIPPED', 'DELIVERED'] } },
    }),
  ])

  return { orders, customers, carts, revenue: revenue._sum.grandTotal ?? 0 }
}

export interface PurgeResult {
  orders: number
  customers: number
  carts: number
  movements: number
  notifications: number
}

/**
 * Removes everything the simulator created and returns the reserved stock it
 * was still holding. Real orders are never touched — the filter is the
 * `isSimulated` flag, not a heuristic.
 */
export async function purgeSimulatedData(): Promise<PurgeResult> {
  const orders = await prisma.order.findMany({
    where: { isSimulated: true },
    select: { id: true, orderNumber: true, status: true, items: { select: { productId: true, quantity: true } } },
  })
  const orderIds = orders.map((o) => o.id)
  const orderNumbers = orders.map((o) => o.orderNumber)

  let movements = 0

  await prisma.$transaction(async (tx) => {
    // Release stock still reserved by simulated orders that never resolved,
    // and give back stock consumed by simulated sales.
    for (const order of orders) {
      const reserved = order.status === 'NEW'
      const sold = ['PAID', 'PROCESSING', 'PACKING', 'READY_FOR_SHIPPING', 'SHIPPED', 'DELIVERED', 'REFUNDED'].includes(order.status)
      for (const item of order.items) {
        if (!item.productId) continue
        if (reserved) {
          await tx.$executeRaw`
            UPDATE "Inventory"
            SET "reserved" = GREATEST(0, "reserved" - ${item.quantity}), "updatedAt" = NOW()
            WHERE "productId" = ${item.productId}
          `
        } else if (sold) {
          await tx.$executeRaw`
            UPDATE "Inventory"
            SET "onHand" = "onHand" + ${item.quantity}, "updatedAt" = NOW()
            WHERE "productId" = ${item.productId}
          `
        }
      }
    }

    if (orderIds.length > 0) {
      await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.shipment.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.order.deleteMany({ where: { id: { in: orderIds } } })
    }

    if (orderNumbers.length > 0) {
      movements = await tx.inventoryMovement.deleteMany({ where: { reference: { in: orderNumbers } } }).then((r) => r.count)
    }
  })

  const [customers, carts, notifications] = await Promise.all([
    prisma.customer.deleteMany({ where: { isSimulated: true } }).then((r) => r.count),
    prisma.cart.deleteMany({ where: { token: { startsWith: 'sim-' } } }).then((r) => r.count),
    prisma.notification.deleteMany({ where: { recipient: { endsWith: `@${SIMULATION_EMAIL_DOMAIN}` } } }).then((r) => r.count),
  ])

  return { orders: orderIds.length, customers, carts, movements, notifications }
}
