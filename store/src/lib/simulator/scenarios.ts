export type ScenarioKey =
  | 'HAPPY_PATH'
  | 'IN_FULFILMENT'
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'ABANDONED_CART'
  | 'OUT_OF_STOCK'

export interface ScenarioDefinition {
  key: ScenarioKey
  label: string
  description: string
  /** Relative weight used by the "mixed" preset. */
  weight: number
}

/**
 * Each scenario drives the real domain services — the same code path a real
 * customer takes — so a run also proves that reservations, idempotency and
 * status rules behave.
 */
export const SCENARIOS: ScenarioDefinition[] = [
  {
    key: 'HAPPY_PATH',
    label: 'הזמנה שהושלמה',
    description: 'הזמנה → תשלום → טיפול → אריזה → משלוח → מסירה. מוריד מלאי ומייצר תנועות מכירה.',
    weight: 40,
  },
  {
    key: 'IN_FULFILMENT',
    label: 'הזמנה בטיפול',
    description: 'שולמה ונמצאת באחד משלבי האריזה או המשלוח — כדי לראות עומס עבודה פתוח במחסן.',
    weight: 20,
  },
  {
    key: 'AWAITING_PAYMENT',
    label: 'ממתינה לתשלום',
    description: 'הזמנה נוצרה, התשלום עדיין pending. המלאי משוריין אך לא ירד.',
    weight: 10,
  },
  {
    key: 'PAYMENT_FAILED',
    label: 'תשלום שנכשל',
    description: 'התשלום נכשל והשריון משוחרר חזרה למלאי.',
    weight: 8,
  },
  {
    key: 'CANCELLED',
    label: 'הזמנה שבוטלה',
    description: 'בוטלה לפני תשלום; השריון משוחרר.',
    weight: 7,
  },
  {
    key: 'REFUNDED',
    label: 'זיכוי',
    description: 'הזמנה ששולמה ונמסרה, ולאחר מכן זוכתה (מלא או חלקי) דרך ספק הסליקה.',
    weight: 8,
  },
  {
    key: 'ABANDONED_CART',
    label: 'עגלה נטושה',
    description: 'עגלה עם פריטים שלא הגיעה לקופה. לא נוצרת הזמנה ולא נשרין מלאי.',
    weight: 7,
  },
  {
    key: 'OUT_OF_STOCK',
    label: 'ניסיון מעבר למלאי',
    description: 'ניסיון להזמין יותר מהזמין. מוודא שהמערכת דוחה ולא מוכרת ביתר.',
    weight: 0,
  },
]

export const SCENARIO_BY_KEY = new Map(SCENARIOS.map((s) => [s.key, s]))
