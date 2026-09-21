import { prisma } from '@/lib/db'
import type {
  CreateShipmentInput, CreateShipmentResult, ShippingOption, ShippingProvider, ShippingQuoteInput,
} from './types'
import type { ShipmentStatus } from '@/generated/prisma/enums'

/**
 * Quotes come from the ShippingZone/ShippingRate tables, so switching carriers
 * later does not touch checkout — only `createShipment`/`track` change.
 */
export class SandboxShippingProvider implements ShippingProvider {
  readonly name = 'sandbox'
  readonly isSandbox = true

  async quote(input: ShippingQuoteInput): Promise<ShippingOption[]> {
    const zone =
      (await prisma.shippingZone.findFirst({ where: { cities: { has: input.city } }, include: { rates: true } })) ??
      (await prisma.shippingZone.findFirst({ where: { isDefault: true }, include: { rates: true } }))

    if (!zone) return []

    return zone.rates
      .filter((rate) => rate.isActive)
      .filter((rate) => rate.minOrderTotal === null || input.subtotal >= rate.minOrderTotal)
      .map((rate) => ({
        method: rate.method as ShippingOption['method'],
        label: rate.label,
        price: rate.freeOver !== null && input.subtotal >= rate.freeOver ? 0 : rate.price,
        etaText: rate.etaText,
      }))
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return {
      trackingCode: `SBX-${input.orderNumber}`,
      trackingUrl: null,
      status: 'PENDING',
    }
  }

  async track(_trackingCode: string): Promise<ShipmentStatus> {
    void _trackingCode
    return 'PENDING'
  }
}
