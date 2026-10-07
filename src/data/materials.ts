import { NOT_ENTERED } from '../types';
import type { Material, MaterialLabel, TreatmentTemplate } from '../types';

/**
 * מאגר החומרים ההתחלתי.
 *
 * חשוב: נתוני מספר רישום, חומר פעיל וקישור לתווית הוזנו לפי מה שנמסר על ידי המשתמש.
 * מינונים, אזהרות, זמני כניסה מחדש והוראות ללקוח *לא* הוזנו כאן, משום שלא ניתן היה
 * לקרוא את התוויות הרשמיות. כל ערך כזה מסומן NOT_ENTERED והחומר מסומן 'unverified'.
 * אין להמציא נתון רגולטורי. יש להשלים מהתווית הרשמית ואז לסמן אימות.
 */

export const MATERIALS: Material[] = [
  {
    id: 'mat_dragon',
    tradeName: 'דרגון',
    formulation: NOT_ENTERED,
    form: 'spray',
    activeIngredients: [{ name: 'Bifenthrin', concentration: '9.6%' }],
    registrationNumber: '640',
    aliases: ['dragon', 'ביפנתרין', 'bifenthrin'],
    labelId: 'lbl_dragon',
  },
  {
    id: 'mat_draker',
    tradeName: 'דרקר 10.2',
    formulation: NOT_ENTERED,
    form: 'spray',
    activeIngredients: [
      { name: 'Cypermethrin', concentration: '10%' },
      { name: 'Tetramethrin', concentration: '2%' },
      { name: 'Piperonyl Butoxide', concentration: '10%' },
    ],
    registrationNumber: '569',
    aliases: ['draker', 'דרקר', 'ציפרמתרין', 'cypermethrin', 'tetramethrin'],
    labelId: 'lbl_draker',
  },
  {
    id: 'mat_pastion_plus',
    tradeName: 'פסטיון פלוס פסטה',
    formulation: NOT_ENTERED,
    form: 'bait_paste',
    activeIngredients: [
      { name: 'Brodifacoum', concentration: '0.005%' },
      { name: 'Denatonium Benzoate (חומר מר)', concentration: '0.001%' },
    ],
    registrationNumber: '584',
    aliases: ['pastion', 'פסטיון', 'ברודיפקום', 'brodifacoum', 'פסטה'],
    labelId: 'lbl_pastion_plus',
  },
  {
    id: 'mat_blokion_plus',
    tradeName: 'בלוקיון פלוס',
    formulation: NOT_ENTERED,
    form: 'other',
    activeIngredients: [],
    registrationNumber: NOT_ENTERED,
    aliases: ['blokion', 'בלוקיון'],
    labelId: 'lbl_blokion_plus',
  },
];

export const MATERIAL_LABELS: MaterialLabel[] = [
  {
    id: 'lbl_dragon',
    materialId: 'mat_dragon',
    sourceUrl: 'https://documents.sviva.gov.il/PesticideLabel_781.pdf',
    registrationValidUntil: undefined,
    approvedPestIds: ['american_roach', 'german_roach', 'bed_bug', 'other_crawling'],
    doses: [
      { id: 'dose_dragon_crawling', label: 'חרקים זוחלים', pestIds: ['american_roach', 'german_roach', 'other_crawling'], amount: NOT_ENTERED, notes: 'יש להזין מטווח המינון שבתווית הרשמית.' },
      { id: 'dose_dragon_bedbug', label: 'פשפש המיטה', pestIds: ['bed_bug'], amount: NOT_ENTERED, notes: 'יש להזין מטווח המינון שבתווית הרשמית.' },
    ],
    humanWarnings: [],
    animalWarnings: [],
    environmentRisks: [],
    customerInstructions: [],
    reEntryHours: undefined,
    reEntryNote: 'זמן כניסה מחדש טרם הוזן מהתווית הרשמית.',
    verificationStatus: 'unverified',
  },
  {
    id: 'lbl_draker',
    materialId: 'mat_draker',
    sourceUrl: 'https://rpc.co.il/docs/draker-tavit.pdf',
    approvedPestIds: ['american_roach', 'german_roach', 'other_crawling', 'flies', 'mosquitoes'],
    doses: [
      {
        id: 'dose_draker_absorbent',
        label: 'חרקים זוחלים – משטח סופג',
        pestIds: ['american_roach', 'german_roach', 'other_crawling'],
        condition: { field: 'surfaceType', value: 'absorbent' },
        amount: NOT_ENTERED,
        notes: 'טווח המינון למשטח סופג – יש להזין מהתווית הרשמית.',
      },
      {
        id: 'dose_draker_non_absorbent',
        label: 'חרקים זוחלים – משטח לא סופג',
        pestIds: ['american_roach', 'german_roach', 'other_crawling'],
        condition: { field: 'surfaceType', value: 'non_absorbent' },
        amount: NOT_ENTERED,
        notes: 'טווח המינון למשטח לא סופג – יש להזין מהתווית הרשמית.',
      },
    ],
    humanWarnings: [],
    animalWarnings: [],
    environmentRisks: [],
    customerInstructions: [],
    reEntryHours: undefined,
    reEntryNote: 'זמן כניסה מחדש טרם הוזן מהתווית הרשמית.',
    verificationStatus: 'unverified',
  },
  {
    id: 'lbl_pastion_plus',
    materialId: 'mat_pastion_plus',
    sourceUrl: 'https://documents.sviva.gov.il/PesticideLabel_701.pdf',
    approvedPestIds: ['mice', 'rats'],
    doses: [
      { id: 'dose_pastion_mice', label: 'עכברים – פיתיון בתיבת האכלה', pestIds: ['mice'], amount: NOT_ENTERED, unit: 'גרם לתיבה', notes: 'יש להזין את הכמות לתיבה מהתווית הרשמית.' },
      { id: 'dose_pastion_rats', label: 'חולדות – פיתיון בתיבת האכלה', pestIds: ['rats'], amount: NOT_ENTERED, unit: 'גרם לתיבה', notes: 'יש להזין את הכמות לתיבה מהתווית הרשמית.' },
    ],
    humanWarnings: [],
    animalWarnings: [],
    environmentRisks: [],
    customerInstructions: [],
    /** null = טיפול בפיתיון; אין זמן כניסה מחדש של ריסוס. */
    reEntryHours: null,
    reEntryNote:
      'טיפול בפיתיון בתיבות האכלה – לא חל זמן כניסה מחדש של ריסוס. ' +
      'יש לפעול לפי הוראות הבטיחות להצבת פיתיון שבתווית הרשמית (תיבות נעולות, מקובעות ומסומנות, הרחק מהישג ידם של ילדים ובעלי חיים). ' +
      'נוסח ההוראות טרם הוזן מהתווית.',
    verificationStatus: 'unverified',
  },
  {
    id: 'lbl_blokion_plus',
    materialId: 'mat_blokion_plus',
    sourceUrl: undefined,
    approvedPestIds: [],
    doses: [],
    humanWarnings: [],
    animalWarnings: [],
    environmentRisks: [],
    customerInstructions: [],
    reEntryHours: undefined,
    reEntryNote: 'מידע התווית טרם הוזן. אין להעתיק נתונים מתכשיר אחר.',
    verificationStatus: 'unverified',
  },
];

/** תבניות מערכת לארבעת החומרים. */
export const SYSTEM_TEMPLATES: TreatmentTemplate[] = [
  {
    id: 'tpl_dragon_crawling',
    name: 'דרגון – חרקים זוחלים',
    materialId: 'mat_dragon',
    pestIds: ['american_roach', 'german_roach', 'other_crawling'],
    defaultActions: ['monitoring', 'spot_treatment', 'spraying'],
    conditionFields: [],
    doseIds: ['dose_dragon_crawling'],
    system: true,
  },
  {
    id: 'tpl_dragon_bedbug',
    name: 'דרגון – פשפש המיטה',
    materialId: 'mat_dragon',
    pestIds: ['bed_bug'],
    defaultActions: ['monitoring', 'vacuum', 'spot_treatment', 'spraying'],
    conditionFields: [
      {
        key: 'bedFrameSprayed',
        question: 'האם רוססה מסגרת/גוף המיטה?',
        options: [
          { value: 'yes', label: 'כן' },
          { value: 'no', label: 'לא' },
        ],
        required: true,
        revealInstructions: {
          yes: [
            'רוססה מסגרת/גוף המיטה: יש להמתין 24 שעות לפני שימוש במיטה, ' +
            'ולפעול לפי הוראת התווית לגבי ייבוש מלא, ריפוד וכיסוי המזרן. ' +
            '(ההנחיה הוזנה לפי הנחיית המפעיל וטרם אומתה מול התווית הרשמית.)',
          ],
        },
      },
    ],
    doseIds: ['dose_dragon_bedbug'],
    system: true,
  },
  {
    id: 'tpl_draker_crawling',
    name: 'דרקר 10.2 – חרקים זוחלים',
    materialId: 'mat_draker',
    pestIds: ['american_roach', 'german_roach', 'other_crawling'],
    defaultActions: ['monitoring', 'spraying'],
    conditionFields: [
      {
        key: 'surfaceType',
        question: 'סוג המשטח המטופל',
        options: [
          { value: 'absorbent', label: 'סופג' },
          { value: 'non_absorbent', label: 'לא סופג' },
        ],
        required: true,
      },
    ],
    doseIds: ['dose_draker_absorbent', 'dose_draker_non_absorbent'],
    system: true,
    notes: 'טווח המינון מוצג רק לאחר בחירת סוג המשטח.',
  },
  {
    id: 'tpl_pastion_mice',
    name: 'פסטיון פלוס פסטה – עכברים',
    materialId: 'mat_pastion_plus',
    pestIds: ['mice'],
    defaultActions: ['monitoring', 'bait_stations'],
    conditionFields: [],
    doseIds: ['dose_pastion_mice'],
    requiresBaitStations: true,
    system: true,
  },
  {
    id: 'tpl_pastion_rats',
    name: 'פסטיון פלוס פסטה – חולדות',
    materialId: 'mat_pastion_plus',
    pestIds: ['rats'],
    defaultActions: ['monitoring', 'bait_stations'],
    conditionFields: [],
    doseIds: ['dose_pastion_rats'],
    requiresBaitStations: true,
    system: true,
  },
];
