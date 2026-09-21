import type { OrderStatus, ShipmentStatus, PaymentStatus } from '@/generated/prisma/enums'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'חדשה',
  PAID: 'שולמה',
  PROCESSING: 'בטיפול',
  PACKING: 'באריזה',
  READY_FOR_SHIPPING: 'מוכנה למשלוח',
  SHIPPED: 'נשלחה',
  DELIVERED: 'נמסרה',
  CANCELLED: 'בוטלה',
  RETURNED: 'הוחזרה',
  REFUNDED: 'זוכתה',
}

export const ORDER_STATUS_TONE: Record<OrderStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  NEW: 'info',
  PAID: 'success',
  PROCESSING: 'info',
  PACKING: 'info',
  READY_FOR_SHIPPING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  RETURNED: 'warning',
  REFUNDED: 'warning',
}

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: 'ממתין',
  READY: 'מוכן',
  PICKED_UP: 'נאסף',
  IN_TRANSIT: 'בדרך',
  DELIVERED: 'נמסר',
  FAILED: 'נכשל',
  RETURNED: 'הוחזר',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'ממתין',
  AUTHORIZED: 'מאושר',
  PAID: 'שולם',
  FAILED: 'נכשל',
  CANCELLED: 'בוטל',
  PARTIALLY_REFUNDED: 'זוכה חלקית',
  REFUNDED: 'זוכה',
}

/** Forward-only workflow, with cancellation available until shipping. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['PACKING', 'CANCELLED'],
  PACKING: ['READY_FOR_SHIPPING', 'CANCELLED'],
  READY_FOR_SHIPPING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
}
