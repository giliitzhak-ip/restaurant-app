/**
 * ספריות ניסוח — הטקסטים שהמדביר משתמש בהם שוב ושוב.
 *
 * הרשימות האלה הגיעו מהגרסה המקומית הקודמת של היומן, והן **הצעות ניסוח
 * בלבד**: המדביר בוחר, עורך ומאשר. אין בהן קביעה רגולטורית, אין בהן
 * מינונים, אין בהן זמני כניסה מחדש, ואין בהן אזהרות ספציפיות לתכשיר —
 * אלה חייבים לבוא מהתווית התקפה של התכשיר ומאישור מפורש של המדביר.
 */

export const TEMPLATE_KINDS = [
  'finding_signs',
  'circumstances',
  'prevention',
  'nature_before',
  'nature_after',
  'warnings',
  'warranty',
] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export interface TemplateLibrary {
  kind: TemplateKind;
  title: string;
  hint: string;
  /** הנתיב בתוכן היומן שאליו הטקסט מתווסף (כשהוא קבוע). */
  defaultPath?: string;
  items: readonly string[];
}

/** סימני נגיעות שנמצאו בניטור. */
export const FINDING_SIGNS_LIBRARY = [
  'תיקנים חיים/פגרים/גללים.',
  'שיירות נמלים.',
  'גללים/כרסומים של חולדות/עכברים.',
  'מחילות מכרסמים.',
  'פשפש מיטה / כתמי דם / ביצים / נימפה.',
  'פרעושים - פרטים חיים בניטור.',
  'קרציות - פרטים חיים בניטור.',
  'יתושים בוגרים/זחלים במים.',
  'זבובים בוגרים.',
  'רימות זבובים.',
  'קן צרעות.',
  'נדלים, צרעות המגיעות לנזילת מים שטופלה — לא נמצא קן באזור.',
  'טרמיטים - פועלות/תעלות בוץ/פרטים מכונפים.',
  'אחרים - פרטים חיים.',
  'דיווח לקוח.',
] as const;

/** הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר. */
export const CIRCUMSTANCES_LIBRARY = [
  'נמצאה פעילות מזיקים בביקורת – נדרש טיפול להפחתת הפעילות.',
  'נמצאו סימני פעילות טריים/לכידות – ניטור בלבד אינו נותן מענה מספק.',
  'נמצאה נגיעות חוזרת במוקד מוכר – פעולות המניעה הקיימות אינן מספיקות.',
  'נמצא מוקד פעיל/אזור קינון – נדרש טיפול ישיר במוקד.',
  'הפעילות נמשכת למרות פעולות מניעה, איטום, ניקיון או מלכודות – נדרש טיפול משלים.',
  'נמשכת פעילות מביקור קודם – נדרשת השלמת הטיפול עד להשגת שליטה בנגיעות.',
  'לא נמצאה פעילות המצדיקה הדברה – בוצעו ביקורת וניטור בלבד.',
] as const;

/** פעולות מניעה שבוצעו או הומלצו ללקוח. */
export const PREVENTION_LIBRARY = [
  'איטום סדקים ופתחים בקירות ובצנרת.',
  'תיקון נזילות ומקורות רטיבות.',
  'סילוק פסולת ושאריות מזון והקפדה על פינוי יומי.',
  'אחסון מזון בכלים אטומים.',
  'ניקוי שומנים ושאריות מאחורי ציוד המטבח.',
  'סתימת פערים סביב צנרת וכבלים.',
  'התקנת רשתות והתקני מניעה בפתחים.',
  'גיזום צמחייה צמודה למבנה.',
  'ייבוש וסילוק מקווי מים עומדים.',
  'הדרכת הלקוח על סדר וניקיון במוקדים.',
] as const;

/** טיב ההדברה המתוכננת, כפי שנמסר ללקוח לפני תחילת העבודה. */
export const NATURE_BEFORE_LIBRARY = [
  'ריסוס שאריתי בנקודות מפתח ובמסתורים.',
  'פיזור פיתיון בתחנות האכלה נעולות ומסומנות.',
  'יישום ג׳ל בנקודות מסתור ומעבר.',
  'ערפול חלל באזור המטופל.',
  'איבוק חללים סמויים.',
  'טיפול נקודתי במוקד הפעילות.',
  'הצבת מלכודות ניטור והדבקה.',
] as const;

/** תיאור ההדברה שבוצעה בפועל. */
export const NATURE_AFTER_LIBRARY = [
  'בוצע ריסוס שאריתי כמתוכנן במוקדים שאותרו.',
  'בוצע פיזור פיתיון בתחנות נעולות ומיקומן סומן.',
  'בוצע יישום ג׳ל בנקודות המסתור שאותרו.',
  'בוצע ערפול חלל בהתאם לתכנון.',
  'בוצע טיפול נקודתי במוקד הפעילות.',
  'הוצבו מלכודות ניטור לבקרה עד הביקור הבא.',
  'לא בוצעה הדברה – בוצעו ביקורת וניטור בלבד.',
  'בוצע טיפול חלקי – נדרשת השלמה בביקור נוסף.',
] as const;

/**
 * הנחיות כלליות ללקוח.
 * שימו לב: אלה ניסוחים כלליים בלבד. זמן כניסה מחדש, אזהרות ייחודיות
 * לתכשיר ומגבלות שימוש נקבעים לפי התווית התקפה ולא לפי רשימה זו.
 */
export const WARNINGS_LIBRARY = [
  'יש לאוורר את האזור המטופל לפני הכניסה.',
  'אין לשטוף את המשטחים שטופלו למשך שבוע.',
  'יש להרחיק ילדים ובעלי חיים עד להתייבשות מלאה.',
  'יש לאסוף פגרי מזיקים ולסלקם לפח סגור.',
  'אין לגעת בתחנות הפיתיון ואין להזיזן.',
  'יש לדווח על פעילות חוזרת לצורך טיפול משלים.',
  'מומלץ ביקור בקרה בהתאם למצב הנגיעות.',
] as const;

/** תנאים והערות לאחריות על הטיפול. */
export const WARRANTY_LIBRARY = [
  'האחריות בתוקף בכפוף לביצוע פעולות המניעה שהומלצו.',
  'האחריות אינה חלה על נגיעות חדשה ממקור חיצוני.',
  'קריאת שירות במסגרת האחריות ללא תשלום.',
  'האחריות מותנית בשמירה על תנאי תברואה תקינים.',
  'האחריות אינה כוללת נזק שנגרם על ידי צד שלישי.',
] as const;

export const TEMPLATE_LIBRARIES: Record<TemplateKind, TemplateLibrary> = {
  finding_signs: {
    kind: 'finding_signs',
    title: 'ממצאי ניטור',
    hint: 'בוחרים ממצאים מהרשימה ומוסיפים ליומן. אפשר לבחור כמה.',
    items: FINDING_SIGNS_LIBRARY,
  },
  circumstances: {
    kind: 'circumstances',
    title: 'הנסיבות לבחירה בהדברה',
    hint: 'הנסיבות שבהן הוחלט לנקוט בהדברה ולא בטיפול אחר.',
    defaultPath: 'prevention.circumstancesForChoosingPestControl',
    items: CIRCUMSTANCES_LIBRARY,
  },
  prevention: {
    kind: 'prevention',
    title: 'פעולות מניעה',
    hint: 'פעולות מניעה שבוצעו או הומלצו ללקוח.',
    items: PREVENTION_LIBRARY,
  },
  nature_before: {
    kind: 'nature_before',
    title: 'טיב ההדברה לפני ביצועה',
    hint: 'תיאור ההדברה המתוכננת, כפי שנמסר ללקוח לפני תחילת העבודה.',
    defaultPath: 'preWarnings.treatmentNatureDescription',
    items: NATURE_BEFORE_LIBRARY,
  },
  nature_after: {
    kind: 'nature_after',
    title: 'טיב ההדברה לאחר הביצוע',
    hint: 'תיאור ההדברה שבוצעה בפועל.',
    defaultPath: 'postWarnings.treatmentPerformedDescription',
    items: NATURE_AFTER_LIBRARY,
  },
  warnings: {
    kind: 'warnings',
    title: 'אזהרות ומידע בסיום',
    hint: 'הנחיות כלליות ללקוח. אינן מחליפות את האזהרות שבתווית התכשיר.',
    defaultPath: 'postWarnings.afterTreatmentInfo',
    items: WARNINGS_LIBRARY,
  },
  warranty: {
    kind: 'warranty',
    title: 'הערות לאחריות',
    hint: 'תנאים והערות לאחריות על הטיפול.',
    defaultPath: 'warranty.notes',
    items: WARRANTY_LIBRARY,
  },
};

/** תקופות האחריות שהיו בגרסה הקודמת. */
export const WARRANTY_PERIODS = [
  'ללא אחריות',
  '30 יום',
  '3 חודשים',
  '6 חודשים',
  '12 חודשים',
  'לפי הסכם',
] as const;

export type WarrantyPeriod = (typeof WARRANTY_PERIODS)[number];

/**
 * נספח א׳ — מזיקים שנדרש עבורם פירוט נוסף.
 * הפירוט נשמר בנפרד משם המזיק, ולכן הוא מופיע גם ביומן וגם ב-PDF.
 */
export interface AnnexRule {
  /** ביטוי לזיהוי שם המזיק. */
  pattern: RegExp;
  label: string;
  /** אפשרויות סגורות, או undefined לטקסט חופשי. */
  options?: readonly string[];
  hint?: string;
}

export const ANNEX_SUBTYPE_RULES: readonly AnnexRule[] = [
  { pattern: /קרצי/, label: 'סוג הקרציות', options: ['קשות', 'רכות'] },
  { pattern: /יתוש/, label: 'שלב היתושים', options: ['בוגרים', 'זחלים'] },
  { pattern: /טרמיט/, label: 'סוג הטרמיטים', options: ['טרמיטי קרקע', 'טרמיטי עץ'] },
  {
    pattern: /חיפושי|יקרונ|ליקטוס|חדקונ/,
    label: 'פירוט ברמת המשפחה',
    hint: 'למשל יקרוניות, ליקטוס, חדקוניות',
  },
];

export function annexRuleFor(pestName: string | undefined | null): AnnexRule | undefined {
  if (!pestName) return undefined;
  return ANNEX_SUBTYPE_RULES.find((rule) => rule.pattern.test(pestName));
}

/**
 * מפריד טקסט רב-שורתי לניסוחים נפרדים, לצורך למידת תבניות.
 * שורה קצרה מדי אינה ניסוח — היא כנראה קיצור או הערה חד-פעמית.
 */
export function splitIntoPhrases(text: string | undefined | null): string[] {
  if (!text) return [];
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 3);
}
