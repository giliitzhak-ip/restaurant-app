import type { ShipmentStatus } from '@/generated/prisma/enums'

export interface ShippingQuoteInput {
  city: string
  subtotal: number
  weightGram?: number
}

export interface ShippingOption {
  method: 'COURIER' | 'PICKUP_POINT' | 'SELF_PICKUP'
  label: string
  price: number
  etaText: string | null
}

export interface CreateShipmentInput {
  orderNumber: string
  method: string
  address: Record<string, unknown>
}

export interface CreateShipmentResult {
  trackingCode: string | null
  trackingUrl: string | null
  status: ShipmentStatus
}

export interface ShippingProvider {
  readonly name: string
  readonly isSandbox: boolean
  quote(input: ShippingQuoteInput): Promise<ShippingOption[]>
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>
  track(trackingCode: string): Promise<ShipmentStatus>
}
