/**
 * מאגר התכשירים הרשמי, כפי שיובא מהמאגר של המשרד להגנת הסביבה.
 *
 * הקובץ src/data/pesticides.generated.json נוצר על ידי:
 *   node scripts/import-pesticides.mjs --file <קובץ שהורד מהמאגר>
 *
 * מה שמגיע מהמאגר: שם התכשיר, מספר רישום, חומר פעיל וריכוזו, תוארית
 * ומזיקים מאושרים. מה שלא מגיע משם: מינונים, אזהרות, הוראות ללקוח וזמן
 * כניסה מחדש — אלה מופיעים רק בתווית הרשמית של כל תכשיר. לכן כל תכשיר
 * מיובא מסומן 'unverified', ושדות התווית נשארים ריקים עד להשלמה ידנית.
 */

import catalog from './pesticides.generated.json';
import { PESTS } from './pests';
import { NOT_ENTERED } from '../types';
import type { Material, MaterialLabel, MaterialForm } from '../types';
import { normalize } from '../lib/search';

interface ImportedMaterial {
  id: string;
  tradeName: string;
  registrationNumber: string;
  formulation: string;
  activeIngredients: { name: string; concentration: string }[];
  holder?: string;
  approvedPestNames?: string[];
  validUntil?: string;
  labelUrl?: string;
}

interface Catalog {
  generatedAt: string;
  source: string;
  officialSource: string;
  count: number;
  materials: ImportedMaterial[];
}

const data = catalog as Catalog;

export const CATALOG_INFO = {
  generatedAt: data.generatedAt,
  source: data.source,
  officialSource: data.officialSource,
  count: data.materials?.length ?? 0,
};

/** ניחוש תצורת התכשיר מתוך התוארית, לצורך תצוגה בלבד. */
function formFromFormulation(formulation: string): MaterialForm {
  const f = normalize(formulation);
  if (f.includes('פיתיון') || f.includes('פסטה')) return 'bait_paste';
  if (f.includes('בלוק') || f.includes('גוש')) return 'bait_block';
  if (f.includes('גל') || f.includes('ג׳ל') || f.includes('גל')) return 'gel';
  if (f.includes('אבק')) return 'dust';
  if (f.includes('תרסיס') || f.includes('תרכיז') || f.includes('תרחיף')) return 'spray';
  return 'other';
}

/** מתאים שמות מזיקים מהמאגר למזהי המזיקים של האפליקציה. */
function matchPestIds(names: string[] | undefined): string[] {
  if (!names?.length) return [];
  const ids = new Set<string>();
  for (const raw of names) {
    const n = normalize(raw);
    if (!n) continue;
    for (const pest of PESTS) {
      const candidates = [pest.name, ...pest.aliases].map(normalize);
      if (candidates.some((c) => c && (n === c || n.includes(c) || c.includes(n)))) {
        ids.add(pest.id);
      }
    }
  }
  return [...ids];
}

/** המרת תאריך dd/mm/yyyy לתקן ISO. ערך שאינו ניתן לפענוח מוחזר כ-undefined. */
function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return undefined;
}

function buildMaterial(item: ImportedMaterial): Material {
  const aliases = new Set<string>();
  for (const ing of item.activeIngredients) aliases.add(ing.name);
  if (item.holder) aliases.add(item.holder);
  if (item.registrationNumber && item.registrationNumber !== NOT_ENTERED) {
    aliases.add(item.registrationNumber);
  }
  return {
    id: item.id,
    tradeName: item.tradeName,
    formulation: item.formulation || NOT_ENTERED,
    form: formFromFormulation(item.formulation),
    activeIngredients: item.activeIngredients,
    registrationNumber: item.registrationNumber || NOT_ENTERED,
    aliases: [...aliases].filter(Boolean),
    labelId: `${item.id}_lbl`,
  };
}

function buildLabel(item: ImportedMaterial): MaterialLabel {
  return {
    id: `${item.id}_lbl`,
    materialId: item.id,
    sourceUrl: item.labelUrl ?? data.officialSource,
    registrationValidUntil: toIsoDate(item.validUntil),
    approvedPestIds: matchPestIds(item.approvedPestNames),
    doses: [],
    humanWarnings: [],
    animalWarnings: [],
    environmentRisks: [],
    customerInstructions: [],
    reEntryHours: undefined,
    reEntryNote:
      'נתוני המינון, האזהרות וזמן הכניסה מחדש אינם חלק ממאגר הרישום, ' +
      'ויש להשלים אותם מהתווית הרשמית של התכשיר.',
    verificationStatus: 'unverified',
  };
}

export const CATALOG_MATERIALS: Material[] = (data.materials ?? []).map(buildMaterial);
export const CATALOG_LABELS: MaterialLabel[] = (data.materials ?? []).map(buildLabel);

/** שמות המזיקים כפי שהופיעו במאגר, לתצוגה כשאין התאמה למזהה פנימי. */
export const CATALOG_PEST_NAMES: Record<string, string[]> = Object.fromEntries(
  (data.materials ?? []).map((m) => [m.id, m.approvedPestNames ?? []]),
);
