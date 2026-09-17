import { media } from "@/lib/media";
import { seedScenes } from "./catalog-seed";

/** Editorial content: copy that belongs to the brand, not to a product. */

export interface FaqItem {
  question: string;
  answer: string;
  /** Anchor so deep links like /faq#installation work. */
  id?: string;
}

export const faq: FaqItem[] = [
  {
    id: "visualiser",
    question: "ההדמיה באמת מדויקת?",
    answer:
      "ההדמיה משתמשת בטקסטורה של המוצר עצמו — לא בתמונה שנוצרה על ידי AI — ומניחה אותה בפרספקטיבה של החדר שצילמתם, תוך שמירה על התאורה והצללים המקוריים. הגוון על המסך תלוי גם בכיול המסך שלכם, ולכן לפני הזמנה גדולה אנחנו ממליצים תמיד להזמין דוגמה פיזית (29 ₪, מוחזר בקנייה).",
  },
  {
    id: "installation",
    question: "אפשר להוסיף התקנה להזמנה?",
    answer:
      "כן. בסל ובטופס הצעת המחיר יש אפשרות להוסיף שירות התקנה. המחיר המוצג הוא לפי מ״ר והוא אומדן: הוא נסגר סופית לאחר מדידה באתר, כולל פינוי רצפה קיימת, פנלים ופרופילי מעבר אם נדרשים.",
  },
  {
    id: "measure",
    question: "כמה חומר צריך להזמין?",
    answer:
      "מחשבון הכמויות שבעמוד המוצר מחשב את השטח, מוסיף אחוז עודפים לבחירתכם (5%, 10% או 15%) ומתרגם את זה למספר חבילות שלמות. בדוגמת הרינגבון או בהנחה אלכסונית מומלץ לבחור 15%. אפשר להוסיף כמה חדרים לאותו חישוב.",
  },
  {
    id: "water",
    question: "מה מתאים לחדר רחצה או למטבח?",
    answer:
      "כל מה שמסומן ״עמיד במים״ — בעיקר דגמי SPC והפאנלים המינרליים. פרקט עץ מהונדס עמיד להתזות אבל לא לעמידה ממושכת במים, ולמינציה מתאימה לחדרי שינה וסלון. אפשר לסנן בקטלוג לפי עמידות למים.",
  },
  {
    id: "delivery",
    question: "מה זמני האספקה?",
    answer:
      "דגמים במלאי יוצאים תוך 2–5 ימי עסקים. בכל מוצר מופיע זמן האספקה בפועל וכמות המלאי מתעדכנת בזמן אמת. דגמים בהזמנה מיוחדת לוקחים 10–21 ימי עסקים, ונציג מאשר את התאריך לפני חיוב.",
  },
  {
    id: "returns",
    question: "אפשר להחזיר?",
    answer:
      "חבילות שלמות, סגורות ובאריזה המקורית — עד 14 יום מקבלת ההזמנה, בהתאם לחוק הגנת הצרכן. חבילות שנפתחו או חומר שנחתך אינם ניתנים להחזרה, ולכן כדאי לפתוח רק את מה שמתקינים בפועל.",
  },
  {
    id: "privacy",
    question: "מה קורה לתמונה של הבית שלי?",
    answer:
      "התמונה משמשת ליצירת ההדמיה בלבד. אורחים — התמונה נמחקת אוטומטית אחרי 7 ימים; משתמשים רשומים — התמונה נשמרת עם הפרויקט וניתן למחוק אותה בלחיצה אחת מתוך ״העיצובים שלי״. אנחנו לא משתמשים בתמונות לאימון מודלים.",
  },
  {
    id: "heating",
    question: "יש לי חימום תת־רצפתי — מה אפשר?",
    answer:
      "רוב הדגמים שלנו מאושרים לחימום תת־רצפתי (מצוין במפרט של כל מוצר). ההמלצה היא הדבקה מלאה ולא התקנה צפה, ולהקפיד על טמפרטורת פני רצפה שלא עולה על 27°C.",
  },
];

export interface ValueProp {
  title: string;
  body: string;
}

export const valueProps: ValueProp[] = [
  {
    title: "הדמיה לפני הזמנה",
    body: "רואים את המוצר האמיתי בחדר שלכם, בשלוש דקות ובלי הרשמה.",
  },
  {
    title: "מלאי אמיתי",
    body: "הכמות וזמן האספקה שמופיעים באתר הם מה שיש במחסן.",
  },
  {
    title: "דוגמה עד הבית",
    body: "דוגמה פיזית ב־29 ₪, מוחזר במלואו בהזמנה.",
  },
  {
    title: "התקנה באחריותנו",
    body: "צוותי התקנה מנוסים, כולל אחריות על העבודה.",
  },
];

export interface InspirationItem {
  key: string;
  title: string;
  description: string;
  image: string;
  /** Rough aspect, so the editorial grid can stay interesting. */
  orientation: "portrait" | "landscape";
}

const inspirationKeys = [
  "inspiration-nordic",
  "inspiration-media",
  "inspiration-bath",
  "inspiration-kitchen",
  "inspiration-bedroom",
  "inspiration-hall",
];

export const inspiration: InspirationItem[] = seedScenes
  .filter((scene) => inspirationKeys.includes(scene.key))
  .map((scene) => ({
    key: scene.key,
    title: scene.title,
    description: scene.description,
    image: media.scene(scene.key),
    orientation: scene.height > scene.width ? "portrait" : "landscape",
  }));

export const customerProjects: InspirationItem[] = seedScenes
  .filter((scene) => scene.key.startsWith("project-"))
  .map((scene) => ({
    key: scene.key,
    title: scene.title,
    description: scene.description,
    image: media.scene(scene.key),
    orientation: "landscape",
  }));

export const designerSteps = [
  { number: "01", key: "step1" },
  { number: "02", key: "step2" },
  { number: "03", key: "step3" },
] as const;
