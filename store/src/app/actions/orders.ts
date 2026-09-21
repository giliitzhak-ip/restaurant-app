'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'
import { refundOrder, transitionOrder } from '@/lib/orders/service'
import type { OrderStatus } from '@/generated/prisma/enums'

export interface OrderActionResult {
  ok: boolean
  error?: string
}

export async function updateOrderStatusAction(orderId: string, status: string): Promise<OrderActionResult> {
  try {
    const session = await requireAdmin('orders.edit')
    const before = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } })
    if (!before) return { ok: false, error: 'ההזמנה לא נמצאה' }

    const result = await transitionOrder(orderId, status as OrderStatus, { actorId: session.userId })
    if (!result.ok) return result

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'order.status_change', entity: 'Order', entityId: orderId,
      before: { status: before.status }, after: { status },
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
    const result = await refundOrder(orderId, amount, reason, session.userId)
    if (!result.ok) return result

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
