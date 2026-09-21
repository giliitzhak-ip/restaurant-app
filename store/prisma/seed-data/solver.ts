export interface SolverQuestionSeed {
  key: string
  prompt: string
  options: { value: string; label: string; tags: string[] }[]
}

export interface SolverPestSeed {
  slug: string
  name: string
  intro: string
  questions: SolverQuestionSeed[]
}

const LOCATION_QUESTION: SolverQuestionSeed = {
  key: 'location',
  prompt: 'איפה הבעיה?',
  options: [
    { value: 'kitchen', label: 'מטבח', tags: ['indoor', 'kitchen', 'food-area'] },
    { value: 'bathroom', label: 'חדר רחצה', tags: ['indoor', 'bathroom', 'humid'] },
    { value: 'living', label: 'סלון', tags: ['indoor', 'living'] },
    { value: 'bedroom', label: 'חדר שינה', tags: ['indoor', 'bedroom'] },
    { value: 'balcony', label: 'מרפסת', tags: ['outdoor', 'balcony'] },
    { value: 'yard', label: 'חצר', tags: ['outdoor', 'yard'] },
    { value: 'garden', label: 'גינה', tags: ['outdoor', 'garden'] },
    { value: 'storage', label: 'מחסן', tags: ['indoor', 'storage'] },
    { value: 'perimeter', label: 'סביבת הבית', tags: ['outdoor', 'perimeter'] },
  ],
}

const HOUSEHOLD_QUESTION: SolverQuestionSeed = {
  key: 'household',
  prompt: 'מי נמצא בבית?',
  options: [
    { value: 'children', label: 'ילדים קטנים', tags: ['children', 'low-risk-required'] },
    { value: 'pets', label: 'חיות מחמד', tags: ['pets', 'low-risk-required'] },
    { value: 'both', label: 'גם וגם', tags: ['children', 'pets', 'low-risk-required'] },
    { value: 'none', label: 'אף אחד מהם', tags: [] },
  ],
}

const SEVERITY_QUESTION: SolverQuestionSeed = {
  key: 'severity',
  prompt: 'מה היקף הבעיה?',
  options: [
    { value: 'few', label: 'ראיתי בודדים', tags: ['low'] },
    { value: 'recurring', label: 'חוזר כל כמה ימים', tags: ['medium'] },
    { value: 'many', label: 'הרבה, בכל מקום', tags: ['high', 'professional-check'] },
  ],
}

/**
 * The wizard is data-driven: questions, options and the tags they emit are all
 * editable from the admin. No diagnosis is asserted and no usage claim is made
 * here — recommendations are filtered later against verified product data.
 */
export const SOLVER_SEED: SolverPestSeed[] = [
  { slug: 'ants', name: 'נמלים', intro: 'נמלים מגיעות בדרך כלל אחרי מקור מזון או לחות.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION, HOUSEHOLD_QUESTION] },
  { slug: 'cockroaches', name: 'תיקנים', intro: 'תיקנים מעדיפים מסתור חם ולח.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION, HOUSEHOLD_QUESTION] },
  { slug: 'flies', name: 'זבובים', intro: 'זבובים מגיעים ממקורות אורגניים בסביבה הקרובה.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION] },
  { slug: 'mosquitoes', name: 'יתושים', intro: 'יתושים מתרבים במים עומדים.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION, HOUSEHOLD_QUESTION] },
  { slug: 'rodents', name: 'מכרסמים', intro: 'מכרסמים נכנסים דרך פתחים קטנים ומחפשים מזון ומחסה.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION, HOUSEHOLD_QUESTION] },
  { slug: 'pigeons', name: 'יונים', intro: 'יונים חוזרות למקומות נחיתה קבועים.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION] },
  { slug: 'moths', name: 'עש', intro: 'עש הבגדים ועש המזון דורשים פתרונות שונים.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION] },
  { slug: 'silverfish', name: 'דג הכסף', intro: 'דג הכסף מופיע באזורים לחים וחשוכים.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION] },
  { slug: 'garden-pests', name: 'מזיק בגינה', intro: 'מזיקי גינה נבדלים לפי הצמח הנפגע.', questions: [LOCATION_QUESTION, SEVERITY_QUESTION] },
]
