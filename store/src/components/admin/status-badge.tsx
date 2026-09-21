import type { ProductStatus, RegulatoryStatus } from '@/generated/prisma/enums'
import { Badge } from '@/components/ui/badge'
import {
  PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE,
  REGULATORY_STATUS_LABELS, REGULATORY_STATUS_TONE,
} from '@/lib/catalog/status'

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge tone={PRODUCT_STATUS_TONE[status]}>{PRODUCT_STATUS_LABELS[status]}</Badge>
}

export function RegulatoryStatusBadge({ status }: { status: RegulatoryStatus }) {
  return <Badge tone={REGULATORY_STATUS_TONE[status]}>{REGULATORY_STATUS_LABELS[status]}</Badge>
}

export function DemoBadge() {
  return <Badge tone="warning">DEMO</Badge>
}
