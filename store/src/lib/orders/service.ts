import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import type { PaymentStatus } from '@/generated/prisma/enums'
import { effectivePrice, vatFromGross } from '@/lib/money'
import { getSetting } from '@/lib/settings'
import { getPaymentProvider } from '@/lib/payments'
import { sendEmail } from '@/lib/email'

export interface PlaceOrderInput {
  cartToken: string
  email: string
  phone: string
  shippingAddress: {
    fullName: string
    city: string
    street: string
    houseNumber: string
    apartment?: string
    floor?: string
    entrance?: string
    postalCode?: string
    courierNote?: string
  }
  invoiceDetails?: { businessName?: string; taxId?: string } | null
  shippingMethod: string
  shippingPrice: number
  couponCode?: string | null
  customerNote?: string | null
  marketingOptIn: boolean
}

export class OutOfStockError extends Error {
  constructor(public readonly productName: string) {
    super(`המוצר "${productName}" אינו זמין בכמות המבוקשת`)
    this.name = 'OutOfStockError'
  }
}

function orderNumber(): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `${stamp}-${Math.floor(Math.random() * 90000 + 10000)}`
}

/**
 * Creates the order and reserves stock inside one serialisable transaction.
 * Rows are locked in a stable order and availability is re-checked under the
 * lock, so two concurrent checkouts cannot oversell the same unit.
 */
export async function placeOrder(input: PlaceOrderInput) {
  const vatRateBp = (await getSetting('tax.vatRateBp')) as number

  const order = await prisma.$transaction(
    async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { token: input.cartToken },
        include: {
          items: {
            where: { savedForLater: false },
            orderBy: { productId: 'asc' },
            include: { product: { include: { inventory: true } } },
          },
        },
      })
      if (!cart || cart.items.length === 0) throw new Error('העגלה ריקה')

      let subtotal = 0
      const orderItems: Prisma.OrderItemCreateWithoutOrderInput[] = []

      for (const item of cart.items) {
        const product = item.product
        if (!product.published || product.status !== 'PUBLISHED') {
          throw new Error(`המוצר "${product.name}" אינו זמין לרכישה`)
        }
        const price = effectivePrice(product.price, product.salePrice)
        if (price === null) throw new Error(`למוצר "${product.name}" אין מחיר`)

        if (product.stockPolicy !== 'ALLOW_BACKORDER') {
          const inv = product.inventory
          const available = (inv?.onHand ?? 0) - (inv?.reserved ?? 0)
          if (available < item.quantity) throw new OutOfStockError(product.name)
        }

        const lineTotal = price * item.quantity
        subtotal += lineTotal
        orderItems.push({
          product: { connect: { id: product.id } },
          name: product.name,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice: price,
          lineTotal,
        })
      }

      const discountTotal = 0
      const grandTotal = subtotal - discountTotal + input.shippingPrice

      let customer = await tx.customer.findUnique({ where: { email: input.email } })
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            email: input.email,
            phone: input.phone,
            firstName: input.shippingAddress.fullName.split(' ')[0],
            isGuest: true,
            marketingOptIn: input.marketingOptIn,
            termsAcceptedAt: new Date(),
          },
        })
      }

      const created = await tx.order.create({
        data: {
          orderNumber: orderNumber(),
          customerId: customer.id,
          email: input.email,
          phone: input.phone,
          status: 'NEW',
          subtotal,
          discountTotal,
          shippingTotal: input.shippingPrice,
          vatTotal: vatFromGross(grandTotal, vatRateBp),
          grandTotal,
          couponCode: input.couponCode ?? null,
          shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
          invoiceDetails: (input.invoiceDetails ?? undefined) as Prisma.InputJsonValue | undefined,
          customerNote: input.customerNote ?? null,
          items: { create: orderItems },
          events: { create: { type: 'CREATED', message: 'ההזמנה נוצרה' } },
        },
        include: { items: true },
      })

      // Reserve stock — conditional update so a concurrent order cannot pass.
      for (const item of cart.items) {
        if (item.product.stockPolicy === 'ALLOW_BACKORDER') continue
        const updated = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reserved" = "reserved" + ${item.quantity}, "updatedAt" = NOW()
          WHERE "productId" = ${item.productId}
            AND "onHand" - "reserved" >= ${item.quantity}
        `
        if (updated === 0) throw new OutOfStockError(item.product.name)

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'RESERVATION',
            quantity: -item.quantity,
            reference: created.orderNumber,
          },
        })
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id, savedForLater: false } })

      await tx.shipment.create({
        data: {
          orderId: created.id,
          provider: 'pending',
          method: input.shippingMethod,
          cost: input.shippingPrice,
          status: 'PENDING',
        },
      })

      return created
    },
    { isolationLevel: 'Serializable', timeout: 15_000 },
  )

  const provider = getPaymentProvider()
  const payment = await provider.createPayment({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: order.grandTotal,
    currency: order.currency,
    customerEmail: order.email,
    returnUrl: `/checkout/thank-you/${order.orderNumber}`,
    idempotencyKey: randomUUID(),
  })

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      providerRef: payment.providerRef,
      idempotencyKey: payment.providerRef,
      status: payment.status,
      amount: order.grandTotal,
      currency: order.currency,
    },
  })

  await sendEmail({
    to: order.email,
    template: 'ORDER_CONFIRMATION',
    subject: `הזמנה ${order.orderNumber} התקבלה`,
    data: { orderNumber: order.orderNumber, total: order.grandTotal },
  })

  return { order, redirectUrl: payment.redirectUrl }
}

/**
 * Applies a provider payment result. Safe to call repeatedly: the webhook
 * event id is recorded, so a duplicate delivery is a no-op.
 */
export async function applyPaymentResult(params: {
  provider: string
  externalId: string
  providerRef: string
  status: PaymentStatus
  payloadHash: string
}): Promise<{ applied: boolean }> {
  const already = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: params.provider, externalId: params.externalId } },
  })
  if (already) return { applied: false }

  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.create({
      data: { provider: params.provider, externalId: params.externalId, payloadHash: params.payloadHash },
    })

    const payment = await tx.payment.findFirst({ where: { providerRef: params.providerRef } })
    if (!payment) return

    await tx.payment.update({ where: { id: payment.id }, data: { status: params.status } })

    if (params.status === 'PAID') {
      const order = await tx.order.findUnique({ where: { id: payment.orderId }, include: { items: true } })
      if (!order || order.status !== 'NEW') return

      await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } })
      await tx.orderEvent.create({
        data: { orderId: order.id, type: 'PAID', message: 'התשלום אושר' },
      })

      // Convert the reservation into a sale.
      for (const item of order.items) {
        if (!item.productId) continue
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" - ${item.quantity},
              "reserved" = GREATEST(0, "reserved" - ${item.quantity}),
              "updatedAt" = NOW()
          WHERE "productId" = ${item.productId}
        `
        await tx.inventoryMovement.create({
          data: { productId: item.productId, type: 'SALE', quantity: -item.quantity, reference: order.orderNumber },
        })
      }
    }

    if (params.status === 'FAILED' || params.status === 'CANCELLED') {
      const order = await tx.order.findUnique({ where: { id: payment.orderId }, include: { items: true } })
      if (!order || order.status !== 'NEW') return
      for (const item of order.items) {
        if (!item.productId) continue
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reserved" = GREATEST(0, "reserved" - ${item.quantity}), "updatedAt" = NOW()
          WHERE "productId" = ${item.productId}
        `
        await tx.inventoryMovement.create({
          data: { productId: item.productId, type: 'RELEASE', quantity: item.quantity, reference: order.orderNumber },
        })
      }
      await tx.orderEvent.create({ data: { orderId: order.id, type: 'PAYMENT_FAILED', message: 'התשלום נכשל' } })
    }
  })

  return { applied: true }
}
