import type { AppState, Material, MaterialLabel, TreatmentTemplate, JournalMaterial } from '../types';
import { NOT_ENTERED } from '../types';

/**
 * מיזוג מאגר התכשירים שמגיע עם הקוד עם מה ששמור במכשיר.
 *
 * המאגר הוא המקור המרכזי, אבל במכשיר יש עותק שנשמר בעבר. עד כה
 * המיזוג השווה מזהים בלבד, ולכן כששינוי בייבוא העניק לאותו תכשיר
 * מזהה אחר – התכשיר הופיע פעמיים ברשימה, והיומנים ההיסטוריים
 * הצביעו על המזהה הישן ואיבדו את מספר הרישום.
 *
 * כאן ההשוואה היא לפי מספר הרישום, שהוא המזהה האמיתי של תכשיר
 * רשום. רשומה כפולה אינה נמחקת סתם: היא מתמזגת לרשומה הקנונית,
 * וכל ההפניות אליה (יומנים, תוויות, תבניות) מוסבות אליה.
 *
 * מה שאינו מתמזג: שתי רשומות עם שני מספרי רישום שונים. אלה שני
 * תכשירים, גם אם השם המסחרי דומה.
 */

/** מספר רישום להשוואה. ריק או "לא הוזן" אינם מזהים ואינם ממזגים. */
function regKey(value: string | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === NOT_ENTERED) return '';
  return raw.replace(/\s+/g, '').toLowerCase();
}

export interface CatalogMerge {
  materials: Material[];
  materialLabels: MaterialLabel[];
  treatmentTemplates: TreatmentTemplate[];
  journalMaterials: JournalMaterial[];
  /** מזהה ישן → מזהה קנוני. נשמר לתיעוד ולבדיקה. */
  remapped: Record<string, string>;
  /** כמה רשומות כפולות אוחדו. */
  merged: number;
}

export function mergeCatalog(
  seeded: Pick<AppState, 'materials' | 'materialLabels' | 'treatmentTemplates'>,
  stored: Partial<Pick<AppState, 'materials' | 'materialLabels' | 'treatmentTemplates' | 'journalMaterials'>>,
): CatalogMerge {
  const materials: Material[] = [...seeded.materials];
  const byId = new Map(materials.map((m) => [m.id, m]));
  const byReg = new Map<string, Material>();
  for (const m of materials) {
    const key = regKey(m.registrationNumber);
    if (key && !byReg.has(key)) byReg.set(key, m);
  }

  const remapped: Record<string, string> = {};
  let merged = 0;

  for (const stale of stored.materials ?? []) {
    if (!stale || typeof stale.id !== 'string') continue;
    if (byId.has(stale.id)) continue;                    // אותה רשומה בדיוק

    const canonical = byReg.get(regKey(stale.registrationNumber));
    if (canonical) {
      // אותו מספר רישום = אותו תכשיר. ההפניות יוסבו לרשומה הקנונית.
      remapped[stale.id] = canonical.id;
      merged += 1;
      continue;
    }

    /* תכשיר שאינו במאגר הנוכחי – נשמר. ייתכן שהוזן ידנית, וייתכן
       שהרישום שלו בוטל. מחיקתו הייתה מוחקת את ההיסטוריה שמצביעה עליו. */
    materials.push(stale);
    byId.set(stale.id, stale);
    const key = regKey(stale.registrationNumber);
    if (key && !byReg.has(key)) byReg.set(key, stale);
  }

  const mapId = (id: string): string => remapped[id] ?? id;

  /* תוויות: תווית שהמשתמש אימת ידנית גוברת על תווית המאגר, כי היא
     מידע שנוסף בעבודה. בכל מקרה אחר תווית המאגר היא הקובעת. */
  const labels: MaterialLabel[] = [...seeded.materialLabels];
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const labelIndexByMaterial = new Map(labels.map((l, i) => [l.materialId, i]));

  for (const stale of stored.materialLabels ?? []) {
    if (!stale || typeof stale.id !== 'string') continue;
    const materialId = mapId(stale.materialId);
    const moved = materialId === stale.materialId ? stale : { ...stale, materialId };
    const at = labelIndexByMaterial.get(materialId);

    if (at === undefined) {
      if (labelById.has(moved.id)) continue;
      labels.push(moved);
      labelById.set(moved.id, moved);
      labelIndexByMaterial.set(materialId, labels.length - 1);
      continue;
    }
    if (moved.verificationStatus === 'verified' && labels[at].verificationStatus !== 'verified') {
      labels[at] = moved;
    }
  }

  const templates: TreatmentTemplate[] = [...seeded.treatmentTemplates];
  const templateIds = new Set(templates.map((t) => t.id));
  for (const stale of stored.treatmentTemplates ?? []) {
    if (!stale || typeof stale.id !== 'string' || templateIds.has(stale.id)) continue;
    templates.push(
      stale.materialId && mapId(stale.materialId) !== stale.materialId
        ? { ...stale, materialId: mapId(stale.materialId) }
        : stale,
    );
    templateIds.add(stale.id);
  }

  /* הסבת ההפניות ביומנים. צילום היומן אינו נוגע בזה: המסמך שנמסר
     ללקוח נשאר כפי שהיה, וכאן רק ההפניה לרשומת התכשיר מתוקנת. */
  const journalMaterials = (stored.journalMaterials ?? []).map((jm) =>
    (remapped[jm.materialId] ? { ...jm, materialId: remapped[jm.materialId] } : jm),
  );

  return { materials, materialLabels: labels, treatmentTemplates: templates, journalMaterials, remapped, merged };
}
