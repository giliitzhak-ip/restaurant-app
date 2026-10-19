import type { ModuleKey } from "@/providers/types";

export type StudioModule = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  phase: number;
  provider?: ModuleKey;
};

/** The product modules, in roadmap order. `phase` is when the module goes live. */
export const STUDIO_MODULES: StudioModule[] = [
  {
    slug: "projects",
    title: "ספריית פרויקטים",
    subtitle: "Project Library",
    description: "העלאת תמונות וסרטונים, שמירת פרויקטים, תצוגה מקדימה והיסטוריית פעולות.",
    phase: 2,
  },
  {
    slug: "face-swap",
    title: "AI Face Swap Studio",
    subtitle: "החלפת פנים בווידאו",
    description: "החלפת פנים בסרטון תוך שמירה על תנועות הגוף, תנועות הראש והאודיו המקורי. לפני / אחרי והורדה.",
    phase: 3,
    provider: "faceSwap",
  },
  {
    slug: "voice",
    title: "AI Voice Studio",
    subtitle: "קולות סינתטיים בעברית",
    description: "הקראת טקסט בעברית, בחירת קול, קצב וסגנון, וקולות משובטים רק בהסכמה מאומתת.",
    phase: 4,
    provider: "voice",
  },
  {
    slug: "lip-sync",
    title: "AI Lip Sync",
    subtitle: "סנכרון שפתיים",
    description: "סנכרון תנועות השפתיים בסרטון לאודיו שהעליתם או שיצרתם במערכת, כולל תיקון היסט.",
    phase: 5,
    provider: "lipSync",
  },
  {
    slug: "motion",
    title: "AI Motion Transfer",
    subtitle: "הנפשת דמות מתנועות",
    description: "הנפשת דמות מתמונה לפי תנועות מסרטון ייחוס. זו טכנולוגיה נפרדת מהחלפת פנים.",
    phase: 6,
    provider: "motion",
  },
  {
    slug: "editor",
    title: "Video Editor",
    subtitle: "עורך וידאו",
    description: "ציר זמן, חיתוך, שילוב קטעים, מוזיקת רקע, Waveform, יחס 9:16 או 16:9 וייצוא MP4.",
    phase: 7,
  },
];

export const CURRENT_PHASE = 1;
