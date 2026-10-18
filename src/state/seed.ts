import type { AppState } from '../types';
import { MATERIALS, MATERIAL_LABELS, SYSTEM_TEMPLATES } from '../data/materials';
import { NOT_ENTERED } from '../types';
import { CATALOG_LABELS, CATALOG_MATERIALS } from '../data/pesticideCatalog';
import { isoNow } from '../lib/format';
import { newId } from '../lib/id';

/** השוואת שמות מסחריים: רווחים וגרשיים אינם משנים. */
function nameKey(value: string): string {
  return String(value ?? '')
    .replace(/[״"'`׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * החומרים שהוזנו ידנית גוברים על המאגר המיובא: אם אותו מספר רישום
 * מופיע בשניהם, נשמרת הגרסה הידנית על תבניות הטיפול שלה.
 *
 * רשומה ידנית ללא מספר רישום מקבלת את מספר הרישום מהמאגר הרשמי,
 * כאשר יש בו תכשיר אחד בלבד באותו שם מסחרי בדיוק. כך לא נוצרות שתי
 * רשומות לאותו תכשיר, ומספר הרישום הרשמי אינו נעלם מהמסמך.
 * המזהה נשאר המזהה הידני, כדי שיומנים ותבניות קיימים לא יישברו.
 * שום נתון אחר אינו מועתק: מינונים ואזהרות אינם במאגר הזה.
 */
function mergedMaterials() {
  const catalogByName = new Map<string, typeof CATALOG_MATERIALS>();
  for (const m of CATALOG_MATERIALS) {
    const key = nameKey(m.tradeName);
    if (!catalogByName.has(key)) catalogByName.set(key, []);
    catalogByName.get(key)!.push(m);
  }

  const manual = MATERIALS.map((m) => {
    if (m.registrationNumber && m.registrationNumber !== NOT_ENTERED) return m;
    const sameName = catalogByName.get(nameKey(m.tradeName)) ?? [];
    if (sameName.length !== 1) return m;   // יותר מהתאמה אחת – לא מנחשים
    const official = sameName[0].registrationNumber;
    if (!official || official === NOT_ENTERED) return m;
    return { ...m, registrationNumber: official };
  });

  const manualRegistrations = new Set(
    manual.map((m) => m.registrationNumber).filter((r) => r && r !== NOT_ENTERED),
  );
  const manualNames = new Set(manual.map((m) => nameKey(m.tradeName)));
  const fromCatalog = CATALOG_MATERIALS.filter(
    (m) => !manualRegistrations.has(m.registrationNumber) && !manualNames.has(nameKey(m.tradeName)),
  );
  return [...manual, ...fromCatalog];
}

function mergedLabels() {
  const keep = new Set(mergedMaterials().map((m) => m.labelId));
  return [...MATERIAL_LABELS, ...CATALOG_LABELS.filter((l) => keep.has(l.id))];
}

/**
 * מזהי ההתחלה נוצרים אקראית ולא כקבועים.
 *
 * מזהה קבוע כמו 'ext_yizhak' היה זהה בכל התקנה, ולכן העסק הראשון
 * שסינכרן אותו היה "תופס" אותו בשרת, וכל עסק אחר היה מקבל דחייה
 * על אותה רשומה בדיוק.
 */
export function seedState(): AppState {
  const userId = newId('usr');
  const exterminatorId = newId('ext');
  return {
    users: [{ id: userId, name: 'יצחק', role: 'admin', phone: '' }],
    exterminators: [
      { id: exterminatorId, userId, name: 'יצחק', licenseNumber: '', phone: '' },
    ],
    customers: [],
    sites: [],
    journals: [],
    journalPests: [],
    journalActions: [],
    journalMaterials: [],
    materials: mergedMaterials(),
    materialLabels: mergedLabels(),
    treatmentTemplates: SYSTEM_TEMPLATES,
    customerTemplates: [],
    routes: [],
    routeStops: [],
    tasks: [],
    baitStations: [],
    attachments: [],
    signatures: [],
    journalSnapshots: [],
    auditLog: [
      {
        id: newId('aud'),
        entity: 'system',
        entityId: 'system',
        action: 'create',
        userId,
        userName: 'יצחק',
        at: isoNow(),
      },
    ],
    currentUserId: userId,
    counters: { journalNumber: 1, customerNumber: 1 },
  };
}
