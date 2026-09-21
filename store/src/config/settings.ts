/**
 * Every operational default lives here and is overridable from Admin → Settings.
 * Nothing that depends on a business decision is hard-coded elsewhere.
 */
export interface SettingDefinition {
  value: unknown
  group: string
  label: string
}

export const DEFAULT_SETTINGS = {
  'store.name': { value: 'בית וגינה', group: 'general', label: 'שם החנות' },
  'store.tagline': { value: 'פתרונות חכמים לבית ולגינה', group: 'general', label: 'סלוגן' },
  'store.supportPhone': { value: '', group: 'general', label: 'טלפון שירות לקוחות' },
  'store.supportEmail': { value: '', group: 'general', label: 'אימייל שירות לקוחות' },
  'store.demoDataBanner': { value: true, group: 'general', label: 'הצגת חיווי "נתוני דמו" בחנות' },

  'catalog.pageSize': { value: 24, group: 'catalog', label: 'מוצרים בעמוד' },
  'catalog.showOutOfStock': { value: true, group: 'catalog', label: 'הצגת מוצרים שאזלו' },

  'cart.freeShippingThreshold': { value: 24900, group: 'cart', label: 'סף משלוח חינם (אגורות)' },
  'cart.freeShippingBarEnabled': { value: true, group: 'cart', label: 'הצגת מד התקדמות למשלוח חינם' },

  'tax.vatRateBp': { value: 1700, group: 'tax', label: 'שיעור מע״מ (נקודות בסיס)' },
  'tax.pricesIncludeVat': { value: true, group: 'tax', label: 'מחירים כוללים מע״מ' },

  'media.maxUploadMb': { value: 10, group: 'media', label: 'גודל קובץ מרבי להעלאה (MB)' },

  'privacy.marketingConsentRequired': { value: true, group: 'privacy', label: 'דרוש אישור נפרד לדיוור' },
  'privacy.analyticsRequiresConsent': { value: true, group: 'privacy', label: 'אנליטיקס רק לאחר הסכמה' },

  'integrations.payment': { value: 'sandbox', group: 'integrations', label: 'ספק סליקה' },
  'integrations.shipping': { value: 'sandbox', group: 'integrations', label: 'ספק משלוחים' },
  'integrations.email': { value: 'console', group: 'integrations', label: 'ספק דוא״ל' },
} as const satisfies Record<string, SettingDefinition>

export type SettingKey = keyof typeof DEFAULT_SETTINGS
