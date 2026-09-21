export interface ContentPageSeed {
  slug: string
  title: string
  kind: string
  excerpt?: string
  bodyHtml: string
  published: boolean
}

/**
 * Policy pages ship as drafts with an explicit placeholder: legal text is a
 * business decision and is never auto-generated.
 */
const PLACEHOLDER = '<p>תוכן העמוד ממתין לעדכון על ידי בעלי החנות. ניתן לערוך אותו ב־Admin ← תוכן.</p>'

export const CONTENT_PAGES: ContentPageSeed[] = [
  { slug: 'shipping-policy', title: 'מדיניות משלוחים', kind: 'POLICY', bodyHtml: PLACEHOLDER, published: false },
  { slug: 'returns-policy', title: 'מדיניות החזרות וביטולים', kind: 'POLICY', bodyHtml: PLACEHOLDER, published: false },
  { slug: 'privacy-policy', title: 'מדיניות פרטיות', kind: 'POLICY', bodyHtml: PLACEHOLDER, published: false },
  { slug: 'terms', title: 'תנאי שימוש', kind: 'POLICY', bodyHtml: PLACEHOLDER, published: false },
  { slug: 'accessibility', title: 'הצהרת נגישות', kind: 'POLICY', bodyHtml: PLACEHOLDER, published: false },
  {
    slug: 'faq',
    title: 'שאלות נפוצות',
    kind: 'FAQ',
    excerpt: 'תשובות לשאלות שחוזרות אצל לקוחות.',
    bodyHtml: PLACEHOLDER,
    published: false,
  },
  {
    slug: 'guide-ants-at-home',
    title: 'איך להתמודד עם נמלים בבית',
    kind: 'GUIDE',
    excerpt: 'מדריך מניעה מעשי — איתור מקור, אטימה ומעקב.',
    bodyHtml: '<p>מדריך זה נכתב כשלד בלבד. התוכן המקצועי ייכתב ויאומת לפני פרסום.</p>',
    published: false,
  },
  {
    slug: 'guide-rodent-prevention',
    title: 'איך למנוע כניסת מכרסמים',
    kind: 'GUIDE',
    excerpt: 'אטימת פתחים, ניהול פסולת ומעקב.',
    bodyHtml: '<p>מדריך זה נכתב כשלד בלבד. התוכן המקצועי ייכתב ויאומת לפני פרסום.</p>',
    published: false,
  },
  {
    slug: 'guide-kitchen-organization',
    title: 'סדר וארגון במטבח',
    kind: 'GUIDE',
    excerpt: 'שיטת עבודה פשוטה לארגון מגירות, מזווה ומשטחים.',
    bodyHtml: '<p>מדריך זה נכתב כשלד בלבד. התוכן ייכתב לפני פרסום.</p>',
    published: false,
  },
  {
    slug: 'guide-garden-summer',
    title: 'הכנת הגינה לקיץ',
    kind: 'GUIDE',
    excerpt: 'השקיה, צל ותחזוקה לפני החום.',
    bodyHtml: '<p>מדריך זה נכתב כשלד בלבד. התוכן ייכתב לפני פרסום.</p>',
    published: false,
  },
]
