import type { ProductKind, ProductStatus } from '../../src/generated/prisma/enums'

/**
 * RPC starter catalogue.
 *
 * Everything here is a placeholder record created so the team can attach real
 * data later. No price, SKU, barcode, registration number, active ingredient,
 * dosage, usage instruction, warning or stock figure is invented — those
 * fields stay null and the admin shows "ממתין לעדכון".
 *
 * Nothing in this file is published. Regulated products carry
 * REQUIRES_VERIFICATION; traps and physical barriers wait for an admin review.
 */
export interface RpcProductSeed {
  slug: string
  name: string
  nameEn?: string
  /** Free-text product type as supplied by the business, not a verified claim. */
  typeNote: string
  kind: ProductKind
  status: ProductStatus
  categorySlugs: string[]
  primaryCategorySlug: string
  keywords: string[]
  /** Set only where the form factor itself makes it unambiguous. */
  poisonFree?: boolean
}

export const RPC_BRAND = 'RPC'

export const RPC_PRODUCTS: RpcProductSeed[] = [
  {
    slug: 'fix-gel',
    name: 'Fix Gel',
    typeNote: 'ג׳ל/פיתיון לנמלים',
    kind: 'PEST_CONTROL',
    status: 'REQUIRES_VERIFICATION',
    categorySlugs: ['pest-prevention', 'ants'],
    primaryCategorySlug: 'ants',
    keywords: ['נמלים', 'ג׳ל', 'פיתיון', 'fix gel'],
  },
  {
    slug: 'super-gel',
    name: 'Super Gel',
    typeNote: 'ג׳ל/פיתיון לתיקנים',
    kind: 'PEST_CONTROL',
    status: 'REQUIRES_VERIFICATION',
    categorySlugs: ['pest-prevention', 'cockroaches'],
    primaryCategorySlug: 'cockroaches',
    keywords: ['תיקנים', 'ג׳וקים', 'ג׳ל', 'פיתיון', 'super gel'],
  },
  {
    slug: 'fly-off',
    name: 'Fly Off',
    typeNote: 'פתרון לזבובים וחרקים מעופפים — סוג המוצר טעון אימות',
    kind: 'PEST_CONTROL',
    status: 'REQUIRES_VERIFICATION',
    categorySlugs: ['pest-prevention', 'flying-insects', 'flies'],
    primaryCategorySlug: 'flying-insects',
    keywords: ['זבובים', 'חרקים מעופפים', 'fly off'],
  },
  {
    slug: 'zvuv-on',
    name: 'זבוב ON',
    nameEn: 'Zvuv ON',
    typeNote: 'מלכודת לזבובים',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'flies'],
    primaryCategorySlug: 'flies',
    keywords: ['זבובים', 'מלכודת', 'זבוב on'],
  },
  {
    slug: 'in-fly',
    name: 'IN-FLY',
    typeNote: 'מלכודת לזבובים',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'flies'],
    primaryCategorySlug: 'flies',
    keywords: ['זבובים', 'מלכודת', 'in fly'],
  },
  {
    slug: 'eco-trap',
    name: 'Eco Trap',
    typeNote: 'מלכודת לצרעות',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'wasps'],
    primaryCategorySlug: 'wasps',
    keywords: ['צרעות', 'מלכודת', 'eco trap'],
  },
  {
    slug: 'proteco-fly-trap',
    name: 'Proteco Fly Trap',
    typeNote: 'מלכודת לזבובים',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'flies'],
    primaryCategorySlug: 'flies',
    keywords: ['זבובים', 'מלכודת', 'proteco'],
  },
  {
    slug: 'master-trap',
    name: 'Master Trap',
    typeNote: 'מלכודת לזבובים — חצר וגינה',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'flies', 'garden'],
    primaryCategorySlug: 'flies',
    keywords: ['זבובים', 'מלכודת', 'חצר', 'גינה', 'master trap'],
  },
  {
    slug: 'master-trap-mini',
    name: 'Master Trap Mini',
    typeNote: 'מלכודת לזבובים — חצר וגינה',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'flies', 'garden'],
    primaryCategorySlug: 'flies',
    keywords: ['זבובים', 'מלכודת', 'חצר', 'גינה', 'master trap mini'],
  },
  {
    slug: 'proteco-max-trap',
    name: 'Proteco Max Trap',
    typeNote: 'מלכודת/ניטור לתיקנים',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'cockroaches'],
    primaryCategorySlug: 'cockroaches',
    keywords: ['תיקנים', 'ניטור', 'מלכודת', 'proteco'],
  },
  {
    slug: 'proteco-food',
    name: 'Proteco Food',
    typeNote: 'מלכודת לעש המזון',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'moths-silverfish', 'food-moths'],
    primaryCategorySlug: 'food-moths',
    keywords: ['עש המזון', 'מלכודת', 'מזווה', 'proteco'],
  },
  {
    slug: 'proteco-mouse',
    name: 'Proteco MOUSE',
    typeNote: 'מלכודת למכרסמים',
    kind: 'TRAP',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'rodents'],
    primaryCategorySlug: 'rodents',
    keywords: ['עכברים', 'מכרסמים', 'מלכודת', 'proteco'],
  },
  {
    slug: 'proteco-spike',
    name: 'Proteco SPIKE',
    typeNote: 'דוקרנים להרחקת יונים',
    kind: 'PHYSICAL_BARRIER',
    status: 'READY_FOR_REVIEW',
    categorySlugs: ['pest-prevention', 'pigeon-deterrent'],
    primaryCategorySlug: 'pigeon-deterrent',
    keywords: ['יונים', 'דוקרנים', 'הרחקה', 'proteco spike'],
    poisonFree: true,
  },
  {
    slug: 'go-away-pigeons',
    name: 'GO AWAY — יונים',
    nameEn: 'GO AWAY Pigeons',
    typeNote: 'פתרון להרחקת יונים — הרכב וסוג המוצר טעונים אימות',
    kind: 'REPELLENT',
    status: 'REQUIRES_VERIFICATION',
    categorySlugs: ['pest-prevention', 'pigeon-deterrent', 'animal-deterrent'],
    primaryCategorySlug: 'pigeon-deterrent',
    keywords: ['יונים', 'הרחקה', 'go away'],
  },
  {
    slug: 'go-away-dogs-cats',
    name: 'GO AWAY — כלבים וחתולים',
    nameEn: 'GO AWAY Dogs & Cats',
    typeNote: 'פתרון להרחקת כלבים/חתולים — הרכב וסוג המוצר טעונים אימות',
    kind: 'REPELLENT',
    status: 'REQUIRES_VERIFICATION',
    categorySlugs: ['pest-prevention', 'animal-deterrent'],
    primaryCategorySlug: 'animal-deterrent',
    keywords: ['כלבים', 'חתולים', 'הרחקה', 'go away'],
  },
  {
    slug: 'nosquito',
    name: 'Nosquito',
    typeNote: 'פתרון יתושים / דוחה — סוג המוצר טעון אימות',
    kind: 'REPELLENT',
    status: 'REQUIRES_VERIFICATION',
    categorySlugs: ['pest-prevention', 'mosquitoes'],
    primaryCategorySlug: 'mosquitoes',
    keywords: ['יתושים', 'דוחה יתושים', 'nosquito'],
  },
]
