import type { CategoryId, Placement } from './types';

export type CategoryKind = 'object' | 'paint' | 'pattern';

export type CategoryDef = {
  id: CategoryId;
  label: string;
  examples: string;
  kind: CategoryKind;
  icon: string; // שם אייקון MaterialCommunityIcons
  defaultPlacement: Placement;
  placements: Placement[];
  /** לתאורה: הצגת הילה/אור כהמחשה. */
  emitsLight?: boolean;
  /** לשטיח: מונח על הרצפה – הטיה בפרספקטיבה כברירת מחדל. */
  liesFlat?: boolean;
  /** האם להציע הסרת רקע (אובייקטים) או בחירת דוגמה (חיפויים). */
  needsPhoto: boolean;
};

export const CATEGORIES: CategoryDef[] = [
  { id: 'furniture', label: 'רהיטים', examples: 'ספות, שולחנות, כיסאות, מיטות, ארונות ושידות', kind: 'object', icon: 'sofa-outline', defaultPlacement: 'floor', placements: ['floor', 'free'], needsPhoto: true },
  { id: 'wallPaint', label: 'צבע לקיר', examples: 'בחירת גוון, דגימה מתמונה, צבעים משלימים', kind: 'paint', icon: 'format-paint', defaultPlacement: 'wall', placements: ['wall', 'ceiling', 'free'], needsPhoto: false },
  { id: 'wallpaper', label: 'טפט', examples: 'דוגמה חוזרת עם קנה מידה וכיוון', kind: 'pattern', icon: 'wallpaper', defaultPlacement: 'wall', placements: ['wall', 'ceiling', 'free'], needsPhoto: true },
  { id: 'wallCladding', label: 'חיפוי קיר', examples: 'לוחות, אבן, עץ, פאנלים', kind: 'pattern', icon: 'wall', defaultPlacement: 'wall', placements: ['wall', 'free'], needsPhoto: true },
  { id: 'tiles', label: 'אריחים', examples: 'קרמיקה, פורצלן, אריחי קיר ורצפה', kind: 'pattern', icon: 'view-grid-outline', defaultPlacement: 'floor', placements: ['floor', 'wall', 'free'], needsPhoto: true },
  { id: 'flooring', label: 'פרקט וריצוף', examples: 'פרקט, למינציה, ריצוף', kind: 'pattern', icon: 'floor-plan', defaultPlacement: 'floor', placements: ['floor', 'free'], needsPhoto: true },
  { id: 'rug', label: 'שטיחים', examples: 'שטיח מונח על הרצפה', kind: 'object', icon: 'rug', defaultPlacement: 'floor', placements: ['floor', 'free'], liesFlat: true, needsPhoto: true },
  { id: 'lighting', label: 'גופי תאורה', examples: 'מנורות תלייה, עומדות, מנורות קיר', kind: 'object', icon: 'ceiling-light-outline', defaultPlacement: 'ceiling', placements: ['ceiling', 'wall', 'table', 'floor', 'free'], emitsLight: true, needsPhoto: true },
  { id: 'curtains', label: 'וילונות', examples: 'וילונות ותריסי בד', kind: 'object', icon: 'curtains', defaultPlacement: 'wall', placements: ['wall', 'free'], needsPhoto: true },
  { id: 'mirrorArt', label: 'מראות ותמונות', examples: 'מראות, תמונות, הדפסים', kind: 'object', icon: 'mirror-rectangle', defaultPlacement: 'wall', placements: ['wall', 'free'], needsPhoto: true },
  { id: 'decor', label: 'אביזרי נוי', examples: 'עציצים, אגרטלים, פסלים', kind: 'object', icon: 'flower-tulip-outline', defaultPlacement: 'table', placements: ['table', 'floor', 'wall', 'free'], needsPhoto: true },
  { id: 'appliance', label: 'מוצרי חשמל', examples: 'טלוויזיה, מקרר, מכונת כביסה', kind: 'object', icon: 'television', defaultPlacement: 'floor', placements: ['floor', 'wall', 'table', 'free'], needsPhoto: true },
];

export const categoryById = (id: CategoryId): CategoryDef =>
  CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

export const PLACEMENTS: { id: Placement; label: string; hint: string; icon: string }[] = [
  { id: 'wall', label: 'קיר', hint: 'תמונה, מראה, מדף, צבע או טפט', icon: 'wall' },
  { id: 'floor', label: 'רצפה', hint: 'רהיט, שטיח, פרקט או ריצוף', icon: 'floor-plan' },
  { id: 'ceiling', label: 'תקרה', hint: 'מנורת תלייה, צבע תקרה', icon: 'ceiling-light-outline' },
  { id: 'table', label: 'שולחן או משטח', hint: 'מנורה, אגרטל, אביזר נוי', icon: 'table-furniture' },
  { id: 'free', label: 'אזור חופשי', hint: 'כל מקום – תמקמו בעצמכם', icon: 'gesture-tap' },
];

export const placementLabel = (p: Placement) => PLACEMENTS.find((x) => x.id === p)?.label ?? '';

/** קטגוריות שמתאימות למיקום שנבחר – כדי להציג רק את מה שרלוונטי. */
export const categoriesForPlacement = (p: Placement) =>
  CATEGORIES.filter((c) => c.placements.includes(p));
