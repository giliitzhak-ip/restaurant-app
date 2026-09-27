// מודל הנתונים. כל הישויות נשמרות מקומית במכשיר; המזהים (UUID) וחותמות הזמן
// מאפשרים להוסיף בעתיד גיבוי וסנכרון לענן בלי לשנות את המבנה.

/** הפניה לתמונה במאגר התמונות המקומי (לא URI ישיר, כדי שיהיה אפשר להעביר מכשיר/ענן). */
export type ImageRef = string;

export type Placement = 'wall' | 'floor' | 'ceiling' | 'table' | 'free';

export type CategoryId =
  | 'furniture'
  | 'wallPaint'
  | 'wallpaper'
  | 'wallCladding'
  | 'tiles'
  | 'flooring'
  | 'rug'
  | 'lighting'
  | 'curtains'
  | 'mirrorArt'
  | 'decor'
  | 'appliance';

export type Pt = { x: number; y: number };

export type Dimensions = { widthCm?: number; heightCm?: number; depthCm?: number };

/** קו ייחוס לקנה מידה: שתי נקודות על תמונת החדר ואורכן האמיתי בס"מ. */
export type ScaleReference = { a: Pt; b: Pt; lengthCm: number };

export type Room = {
  id: string;
  name: string;
  photo: ImageRef;
  photoW: number;
  photoH: number;
  dims?: { widthCm?: number; lengthCm?: number; heightCm?: number };
  scaleRef?: ScaleReference;
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
};

export type Product = {
  id: string;
  category: CategoryId;
  name?: string;
  store?: string;
  price?: number;
  url?: string;
  notes?: string;
  dims?: Dimensions;
  /** תמונה מקורית (מנורמלת) כפי שצולמה. */
  photo?: ImageRef;
  photoW?: number;
  photoH?: number;
  /** מסכה בגודל התמונה המקורית (PNG, ערוץ אלפא) – מאפשרת לחזור ולתקן את החיתוך. */
  mask?: ImageRef;
  /** החיתוך הסופי (PNG שקוף), חתוך לגבולות המוצר. */
  cutout?: ImageRef;
  cutoutW?: number;
  cutoutH?: number;
  /** דוגמת טקסטורה (לאריחים/פרקט/טפט). */
  swatch?: ImageRef;
  swatchW?: number;
  swatchH?: number;
  /** צבע לקיר (לקטגוריית צבע). */
  color?: string;
  selection?: { x: number; y: number; w: number; h: number };
  roomId?: string;
  favorite?: boolean;
  inShoppingList?: boolean;
  purchased?: boolean;
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
};

export type Temperature = 'warm' | 'neutral' | 'cool';

export type ObjectLayer = {
  kind: 'object';
  id: string;
  productId: string;
  placement: Placement;
  /** מרכז האובייקט בקואורדינטות תמונת החדר (פיקסלים). */
  x: number;
  y: number;
  /** רוחב מוצג בפיקסלים של תמונת החדר. */
  width: number;
  rotation: number; // מעלות
  flipX: boolean;
  tiltX: number; // הטיה קדימה/אחורה (פרספקטיבה), מעלות
  tiltY: number; // סיבוב הצידה (פרספקטיבה), מעלות
  opacity: number;
  brightness: number; // -1..1
  contrast: number; // -1..1
  warmth: number; // -1..1
  shadow: { opacity: number; blur: number; dx: number; dy: number; contact: number };
  light?: { enabled: boolean; temperature: Temperature; intensity: number; radius: number; offsetY: number };
  /** אם המשתמש הזין מידות – הגודל חושב מהן. */
  sizedFromDims?: boolean;
};

export type PatternLayout = 'straight' | 'brick';

export type SurfaceLayer = {
  kind: 'surface';
  id: string;
  productId?: string;
  target: 'wall' | 'floor' | 'ceiling' | 'other';
  mode: 'paint' | 'pattern';
  color: string;
  /** natural = שומר צללים ומרקם; multiply = הכפלה; cover = כיסוי אטום */
  blend: 'natural' | 'multiply' | 'cover';
  opacity: number;
  /** ארבע פינות המשטח (סדר: עליונה-שמאלית, עליונה-ימנית, תחתונה-ימנית, תחתונה-שמאלית). */
  quad: [Pt, Pt, Pt, Pt];
  pattern: {
    tileSize: number; // גודל אריח במרחב המשטח (פיקסלים)
    rotation: number; // מעלות
    layout: PatternLayout;
    groutWidth: number;
    groutColor: string;
    shading: number; // 0..1 כמה צללי החדר נשמרים מעל הדוגמה
  };
  /** מסכת אזור (למשל מזיהוי קיר לפי צבע), PNG אלפא בגודל תמונת החדר המוקטנת. */
  regionMask?: ImageRef;
  /** משיכות "מברשת הגנה" שמסירות את הכיסוי מאזורים (רהיטים, חלונות). */
  eraseStrokes: { points: number[]; radius: number }[];
  /** בהירות ממוצעת של המשטח המקורי – לחישוב שמירת צללים. */
  baseLuma: number;
};

export type Layer = ObjectLayer | SurfaceLayer;

export type Ambient = { temperature: Temperature | 'none'; brightness: number };

/** גרסה/אפשרות עיצוב של חדר. כל גרסה נשמרת בנפרד – אין דריסה של עבודה קודמת. */
export type Design = {
  id: string;
  roomId: string;
  name: string;
  layers: Layer[];
  ambient: Ambient;
  thumbnail?: ImageRef;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
};

export type CloudSettings = {
  enabled: boolean;
  serverUrl: string;
  consentAt?: number;
};

export type Settings = {
  onboardingDone: boolean;
  lastRoomId?: string;
  cloud: CloudSettings;
  showTips: boolean;
};
