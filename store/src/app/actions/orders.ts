'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'
import { ORDER_TRANSITIONS } from '@/lib/orders/status'
import { sendEmail } from '@/lib/email'
import type { OrderStatus } from '@/generated/prisma/enums'

export interface OrderActionResult {
  ok: boolean
  error?: string
}

const EMAIL_FOR_STATUS: Partial<Record<OrderStatus, { template: 'PACKING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'; subject: string }>> = {
  PACKING: { template: 'PACKING', subject: 'ההזמנה שלך נארזת' },
  SHIPPED: { template: 'SHIPPED', subject: 'ההזמנה שלך נשלחה' },
  DELIVERED: { template: 'DELIVERED', subject: 'ההזמנה שלך נמסרה' },
  CANCELLED: { template: 'CANCELLED', subject: 'ההזמנה בוטלה' },
}

export async function updateOrderStatusAction(orderId: string, status: string): Promise<OrderActionResult> {
  try {
    const session = await requireAdmin('orders.edit')
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } })
    if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' }

    const target = status as OrderStatus
    if (!ORDER_TRANSITIONS[order.status]?.includes(target)) {
      return { ok: false, error: 'מעבר סטטוס זה אינו מותר' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: target } })
      await tx.orderEvent.create({
        data: { orderId, type: 'STATUS_CHANGE', message: `סטטוס שונה ל-${target}`, actorId: session.userId },
      })

      // Cancelling before payment releases the stock reservation.
      if (target === 'CANCELLED' && order.status === 'NEW') {
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
      }
    })

    const mail = EMAIL_FOR_STATUS[target]
    if (mail) {
      await sendEmail({ to: order.email, template: mail.template, subject: `${mail.subject} — ${order.orderNumber}`, data: { orderNumber: order.orderNumber } })
    }

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'order.status_change', entity: 'Order', entityId: orderId,
      before: { status: order.status }, after: { status: target },
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
  }
}

export async function addOrderNoteAction(orderId: string, note: string): Promise<OrderActionResult> {
  try {
    const session = await requireAdmin('orders.edit')
    await prisma.order.update({ where: { id: orderId }, data: { adminNote: note.slice(0, 2000) } })
    await prisma.orderEvent.create({
      data: { orderId, type: 'NOTE', message: 'הערת מנהל עודכנה', actorId: session.userId },
    })
    revalidatePath(`/admin/orders/${orderId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
  }
}

export async function refundOrderAction(orderId: string, amount: number, reason: string): Promise<OrderActionResult> {
  try {
    const session = await requireAdmin('orders.edit')
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, refunds: true } })
    if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' }

    const alreadyRefunded = order.refunds.reduce((sum, r) => sum + r.amount, 0)
    if (amount <= 0 || alreadyRefunded + amount > order.grandTotal) {
      return { ok: false, error: 'סכום הזיכוי אינו תקין' }
    }

    const payment = order.payments.find((p) => p.status === 'PAID')
    if (!payment) return { ok: false, error: 'אין תשלום ששולם לזיכוי' }

    const { getPaymentProvider } = await import('@/lib/payments')
    const provider = getPaymentProvider()
    const result = await provider.refundPayment(payment.providerRef ?? '', amount)

    const total = alreadyRefunded + amount
    await prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: { orderId, paymentId: payment.id, amount, reason, providerRef: result.providerRef, createdById: session.userId },
      })
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: total >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      })
      if (total >= order.grandTotal) {
        await tx.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } })
      }
      await tx.orderEvent.create({
        data: { orderId, type: 'REFUND', message: `זיכוי בסך ${amount / 100} ₪`, actorId: session.userId },
      })
    })

    await sendEmail({ to: order.email, template: 'REFUND', subject: `זיכוי עבור הזמנה ${order.orderNumber}`, data: { amount } })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'order.refund', entity: 'Order', entityId: orderId, after: { amount, reason },
    })

    revalidatePath(`/admin/orders/${orderId}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
  }
}
