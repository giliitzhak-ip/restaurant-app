import type { ProductStatus, RegulatoryStatus, ProductKind } from '@/generated/prisma/enums'

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: 'טיוטה',
  READY_FOR_REVIEW: 'מוכן לבדיקה',
  REQUIRES_VERIFICATION: 'דורש אימות',
  READY_TO_PUBLISH: 'מוכן לפרסום',
  PUBLISHED: 'מפורסם',
  ARCHIVED: 'בארכיון',
}

export const PRODUCT_STATUS_TONE: Record<ProductStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  READY_FOR_REVIEW: 'info',
  REQUIRES_VERIFICATION: 'warning',
  READY_TO_PUBLISH: 'info',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
}

export const REGULATORY_STATUS_LABELS: Record<RegulatoryStatus, string> = {
  NOT_APPLICABLE: 'לא רלוונטי',
  REQUIRES_VERIFICATION: 'דורש אימות',
  VERIFIED_PUBLIC_USE: 'מאומת לשימוש הקהל הרחב',
  PROFESSIONAL_ONLY: 'לאנשי מקצוע בלבד',
  BLOCKED: 'חסום',
  EXPIRED: 'אימות פג תוקף',
}

export const REGULATORY_STATUS_TONE: Record<RegulatoryStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  NOT_APPLICABLE: 'neutral',
  REQUIRES_VERIFICATION: 'warning',
  VERIFIED_PUBLIC_USE: 'success',
  PROFESSIONAL_ONLY: 'danger',
  BLOCKED: 'danger',
  EXPIRED: 'danger',
}

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  GENERAL: 'מוצר כללי',
  PEST_CONTROL: 'תכשיר הדברה',
  REPELLENT: 'דוחה/מרחיק',
  TRAP: 'מלכודת',
  PHYSICAL_BARRIER: 'מחסום פיזי',
  SMART_DEVICE: 'מוצר חכם',
}

/** Product kinds whose claims must be verified against an official label. */
export const REGULATED_KINDS: ProductKind[] = ['PEST_CONTROL', 'REPELLENT']

export function isRegulatedKind(kind: ProductKind): boolean {
  return REGULATED_KINDS.includes(kind)
}
