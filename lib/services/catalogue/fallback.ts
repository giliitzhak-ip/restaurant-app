import type { CategoryRow, ServiceRow } from '@/types/database';

/**
 * Demo-mode catalogue.
 *
 * Categories and services are database-driven and admin-editable — this is NOT
 * the source of truth. It mirrors `supabase/migrations/…_reference_data.sql`
 * so the landing page and the wizard stay usable before Supabase is wired up.
 * Every consumer prefers the database and only falls back to this when
 * `isSupabaseConfigured()` is false.
 */
const now = '2026-01-01T00:00:00.000Z';

const base = { created_at: now, updated_at: now, description: null, active: true };

const CATEGORY_SEED: Array<[slug: string, name: string, nameEn: string, icon: string, order: number]> = [
  ['plumbing', 'אינסטלציה', 'Plumbing', 'wrench', 10],
  ['electricity', 'חשמל', 'Electricity', 'zap', 20],
  ['pest-control', 'הדברות', 'Pest control', 'bug', 30],
  ['gardening', 'גינון', 'Gardening', 'trees', 40],
  ['hvac', 'מיזוג אוויר', 'HVAC', 'air-vent', 50],
  ['renovations', 'שיפוצים', 'Renovations', 'hammer', 60],
  ['cleaning', 'ניקיון', 'Cleaning', 'sparkles', 70],
  ['locksmith', 'מנעולן', 'Locksmith', 'key-round', 80],
  ['moving', 'הובלות', 'Moving', 'truck', 90],
  ['painting', 'צביעה', 'Painting', 'paint-roller', 100],
  ['carpentry', 'נגרות', 'Carpentry', 'ruler', 110],
  ['aluminum', 'אלומיניום', 'Aluminum', 'panels-top-left', 120],
  ['glazing', 'זגגות', 'Glazing', 'square', 130],
  ['sealing', 'איטום', 'Sealing', 'shield', 140],
  ['sewage', 'ביוב', 'Sewage', 'waves', 150],
  ['maintenance', 'תחזוקה', 'Maintenance', 'settings', 160],
  ['other', 'אחר', 'Other', 'circle-help', 999],
];

const SERVICE_SEED: Record<string, Array<[slug: string, name: string]>> = {
  plumbing: [
    ['blockage', 'סתימה'],
    ['leak', 'נזילה'],
    ['leak-detection', 'איתור נזילה'],
    ['faucet-replace', 'החלפת ברז'],
    ['toilet-repair', 'תיקון אסלה'],
    ['boiler', 'דוד חשמל / שמש'],
  ],
  electricity: [
    ['short-circuit', 'קצר חשמלי'],
    ['new-point', 'נקודת חשמל חדשה'],
    ['panel-upgrade', 'שדרוג לוח חשמל'],
    ['lighting', 'התקנת תאורה'],
    ['appliance-hook', 'חיבור מכשיר חשמלי'],
  ],
  'pest-control': [
    ['cockroaches', 'הדברת תיקנים'],
    ['ants', 'הדברת נמלים'],
    ['mice', 'הדברת עכברים'],
    ['rats', 'הדברת חולדות'],
    ['fleas', 'הדברת פרעושים'],
    ['bedbugs', 'הדברת פשפשים'],
    ['termites', 'הדברת טרמיטים'],
  ],
  gardening: [
    ['mowing', 'כיסוח דשא'],
    ['pruning', 'גיזום עצים'],
    ['irrigation', 'מערכת השקיה'],
    ['garden-design', 'עיצוב גינה'],
    ['synthetic-grass', 'דשא סינתטי'],
  ],
  hvac: [
    ['ac-install', 'התקנת מזגן'],
    ['ac-service', 'ניקוי וטיפול'],
    ['ac-repair', 'תיקון מזגן'],
    ['ac-gas', 'מילוי גז'],
  ],
  renovations: [
    ['full-renovation', 'שיפוץ כללי'],
    ['tiling', 'ריצוף וחיפוי'],
    ['drywall', 'עבודות גבס'],
    ['bathroom', 'שיפוץ חדר רחצה'],
    ['kitchen', 'שיפוץ מטבח'],
  ],
  cleaning: [
    ['apartment', 'ניקיון דירה'],
    ['post-renovation', 'ניקיון לאחר שיפוץ'],
    ['office', 'ניקיון משרד'],
    ['sofa-carpet', 'ניקוי ספות ושטיחים'],
    ['windows', 'ניקוי חלונות'],
  ],
  locksmith: [
    ['lockout', 'פריצת דלת'],
    ['cylinder', 'החלפת צילינדר'],
    ['lock-install', 'התקנת מנעול'],
    ['car-lockout', 'פתיחת רכב'],
  ],
  moving: [
    ['apartment-move', 'הובלת דירה'],
    ['office-move', 'הובלת משרד'],
    ['single-item', 'הובלת פריט בודד'],
    ['crane', 'הובלה עם מנוף'],
  ],
  painting: [
    ['apartment-paint', 'צביעת דירה'],
    ['exterior-paint', 'צביעה חיצונית'],
    ['decorative', 'צביעה דקורטיבית'],
  ],
  carpentry: [
    ['kitchen-cabinets', 'ארונות מטבח'],
    ['closet', 'ארון קיר'],
    ['door-repair', 'תיקון דלתות'],
    ['furniture-assembly', 'הרכבת רהיטים'],
  ],
  aluminum: [
    ['windows', 'חלונות אלומיניום'],
    ['shutters', 'תריסים'],
    ['screens', 'רשתות נגד יתושים'],
    ['balcony-closure', 'סגירת מרפסת'],
  ],
  glazing: [
    ['glass-replace', 'החלפת זכוכית'],
    ['shower-cabin', 'מקלחון'],
    ['mirrors', 'מראות'],
  ],
  sealing: [
    ['roof-sealing', 'איטום גג'],
    ['balcony-sealing', 'איטום מרפסת'],
    ['damp-treatment', 'טיפול ברטיבות'],
  ],
  sewage: [
    ['sewer-opening', 'פתיחת ביוב'],
    ['pumping', 'שאיבת בור'],
    ['camera-inspection', 'בדיקת מצלמה'],
  ],
  maintenance: [
    ['handyman', 'הנדימן'],
    ['periodic', 'תחזוקה תקופתית'],
    ['building', 'תחזוקת בניין'],
  ],
  other: [['custom', 'עבודה מותאמת']],
};

/** Deterministic pseudo-uuid so demo ids stay stable between renders. */
function demoId(prefix: string, slug: string): string {
  const source = `${prefix}-${slug}`.padEnd(32, '0');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  const hex = hash.toString(16).padStart(8, '0');
  const tail = source.replace(/[^a-z0-9]/g, '0').slice(0, 12).padEnd(12, '0');
  return `${hex}-0000-4000-8000-${tail}`;
}

export const FALLBACK_CATEGORIES: CategoryRow[] = CATEGORY_SEED.map(
  ([slug, name, nameEn, icon, sort_order]) => ({
    ...base,
    id: demoId('cat', slug),
    slug,
    name,
    name_en: nameEn,
    icon,
    sort_order,
  }),
);

export const FALLBACK_SERVICES: ServiceRow[] = Object.entries(SERVICE_SEED).flatMap(
  ([categorySlug, services]) =>
    services.map(([slug, name], index) => ({
      ...base,
      id: demoId('svc', `${categorySlug}-${slug}`),
      category_id: demoId('cat', categorySlug),
      slug,
      name,
      name_en: null,
      base_price: null,
      sort_order: (index + 1) * 10,
    })),
);
