import type { ProductKind, ProductStatus, RegulatoryStatus } from '@/generated/prisma/enums'
import { isRegulatedKind } from './status'

export interface PublishCandidate {
  name: string
  kind: ProductKind
  status: ProductStatus
  price: number | null
  mediaCount: number
  regulatory: {
    status: RegulatoryStatus
    publicUseAllowed: boolean | null
    registrationNumber: string | null
    labelVerifiedAt: Date | null
    expiresAt: Date | null
  } | null
}

export interface PublishDecision {
  allowed: boolean
  blockers: string[]
}

/**
 * The single source of truth for "may this product appear in the public
 * store?". Called from the server action AND from the storefront query, so a
 * UI bug can never leak an unverified pesticide to customers.
 */
export function evaluatePublish(candidate: PublishCandidate, now: Date = new Date()): PublishDecision {
  const blockers: string[] = []

  if (candidate.status === 'ARCHIVED') blockers.push('המוצר בארכיון')
  if (candidate.price === null) blockers.push('לא הוגדר מחיר מכירה')
  if (candidate.mediaCount === 0) blockers.push('לא הועלתה אף תמונה למוצר')

  const reg = candidate.regulatory
  if (isRegulatedKind(candidate.kind)) {
    if (!reg) {
      blockers.push('אין רשומה רגולטורית למוצר')
    } else {
      if (reg.status === 'PROFESSIONAL_ONLY') blockers.push('המוצר מסומן לאנשי מקצוע בלבד ואינו ניתן לפרסום בחנות')
      else if (reg.status === 'BLOCKED') blockers.push('המוצר חסום לפרסום')
      else if (reg.status === 'EXPIRED') blockers.push('האימות הרגולטורי פג תוקף')
      else if (reg.status !== 'VERIFIED_PUBLIC_USE') blockers.push('המוצר טרם אומת לשימוש הקהל הרחב')

      if (reg.publicUseAllowed !== true) blockers.push('לא אומת כי המוצר מותר לשימוש הקהל הרחב')
      if (!reg.registrationNumber) blockers.push('חסר מספר רישום')
      if (!reg.labelVerifiedAt) blockers.push('התווית טרם אומתה')
      if (reg.expiresAt && reg.expiresAt.getTime() < now.getTime()) blockers.push('תוקף האימות הרגולטורי פג')
    }
  } else if (reg) {
    // A record exists on an unregulated product (e.g. a trap that ships with a
    // bait): it still has to clear the regulatory desk before going public.
    if (reg.status === 'PROFESSIONAL_ONLY') blockers.push('המוצר מסומן לאנשי מקצוע בלבד ואינו ניתן לפרסום בחנות')
    else if (reg.status === 'BLOCKED') blockers.push('המוצר חסום לפרסום')
    else if (reg.status === 'EXPIRED') blockers.push('האימות הרגולטורי פג תוקף')
    else if (reg.status === 'REQUIRES_VERIFICATION') blockers.push('הרשומה הרגולטורית של המוצר ממתינה לאימות')
  }

  return { allowed: blockers.length === 0, blockers }
}

/** Status transitions the admin UI is allowed to offer. */
export const ALLOWED_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  DRAFT: ['READY_FOR_REVIEW', 'REQUIRES_VERIFICATION', 'ARCHIVED'],
  READY_FOR_REVIEW: ['DRAFT', 'REQUIRES_VERIFICATION', 'READY_TO_PUBLISH', 'ARCHIVED'],
  REQUIRES_VERIFICATION: ['DRAFT', 'READY_FOR_REVIEW', 'READY_TO_PUBLISH', 'ARCHIVED'],
  READY_TO_PUBLISH: ['PUBLISHED', 'DRAFT', 'REQUIRES_VERIFICATION', 'ARCHIVED'],
  PUBLISHED: ['READY_TO_PUBLISH', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
}

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return from === to || (ALLOWED_TRANSITIONS[from]?.includes(to) ?? false)
}
