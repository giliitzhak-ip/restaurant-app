export interface CategorySeed {
  slug: string
  name: string
  nameEn?: string
  description?: string
  children?: CategorySeed[]
}

/**
 * Category tree. Content worlds come from the business plan; nothing here is
 * product data, so it is safe to ship as-is.
 */
export const CATEGORY_TREE: CategorySeed[] = [
  {
    slug: 'pest-prevention',
    name: 'הדברה ומניעה',
    nameEn: 'Pest Prevention',
    description: 'פתרונות לשימוש ביתי למניעה והרחקה של מזיקים נפוצים.',
    children: [
      { slug: 'ants', name: 'נמלים', nameEn: 'Ants' },
      { slug: 'cockroaches', name: 'תיקנים', nameEn: 'Cockroaches' },
      { slug: 'flying-insects', name: 'זבובים וחרקים מעופפים', nameEn: 'Flies & Flying Insects' },
      { slug: 'flies', name: 'זבובים', nameEn: 'Flies' },
      { slug: 'mosquitoes', name: 'יתושים', nameEn: 'Mosquitoes' },
      { slug: 'wasps', name: 'צרעות', nameEn: 'Wasps' },
      { slug: 'rodents', name: 'מכרסמים', nameEn: 'Rodents' },
      { slug: 'moths-silverfish', name: 'עש ודג הכסף', nameEn: 'Moths & Silverfish' },
      { slug: 'food-moths', name: 'עש המזון', nameEn: 'Food Moths' },
      { slug: 'pigeon-deterrent', name: 'הרחקת יונים', nameEn: 'Pigeon Deterrent' },
      { slug: 'animal-deterrent', name: 'הרחקת בעלי חיים', nameEn: 'Animal Deterrent' },
      { slug: 'poison-free', name: 'פתרונות ללא רעל', nameEn: 'Poison Free' },
      { slug: 'garden-pests', name: 'מזיקים בגינה', nameEn: 'Garden Pests' },
    ],
  },
  {
    slug: 'garden',
    name: 'גינה וחצר',
    nameEn: 'Garden & Outdoor',
    description: 'כל מה שצריך כדי לתחזק ולהנות מהחצר והגינה.',
    children: [
      { slug: 'irrigation', name: 'השקיה', nameEn: 'Irrigation' },
      { slug: 'garden-tools', name: 'כלי גינון', nameEn: 'Garden Tools' },
      { slug: 'bbq', name: 'BBQ', nameEn: 'BBQ' },
    ],
  },
  {
    slug: 'organization',
    name: 'סדר וארגון',
    nameEn: 'Home Organization',
    description: 'אחסון וארגון חכם לכל חדר בבית.',
    children: [
      { slug: 'storage', name: 'אחסון', nameEn: 'Storage' },
      { slug: 'boxes', name: 'קופסאות', nameEn: 'Boxes' },
      { slug: 'baskets', name: 'סלסלות', nameEn: 'Baskets' },
      { slug: 'organizers', name: 'ארגוניות', nameEn: 'Organizers' },
      { slug: 'stands', name: 'מעמדים', nameEn: 'Stands' },
    ],
  },
  {
    slug: 'kitchen',
    name: 'מטבח',
    nameEn: 'Kitchen',
    description: 'סדר, אחסון ופתרונות מטבח יומיומיים.',
  },
  {
    slug: 'bathroom',
    name: 'אמבטיה',
    nameEn: 'Bathroom',
    description: 'ארגון ונוחות בחדר הרחצה.',
  },
  {
    slug: 'cleaning',
    name: 'ניקיון',
    nameEn: 'Cleaning',
    children: [{ slug: 'bins', name: 'פחים', nameEn: 'Bins' }],
  },
  {
    slug: 'home',
    name: 'מוצרים לבית',
    nameEn: 'Home Products',
  },
  {
    slug: 'smart-home',
    name: 'Smart Home',
    nameEn: 'Smart Home',
    children: [{ slug: 'smart-pest', name: 'Smart Pest', nameEn: 'Smart Pest' }],
  },
  { slug: 'sale', name: 'מבצעים', nameEn: 'Sale' },
  { slug: 'solution-bundles', name: 'חבילות פתרון', nameEn: 'Solution Bundles' },
]
