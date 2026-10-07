import type { AppState } from '../types';
import { MATERIALS, MATERIAL_LABELS, SYSTEM_TEMPLATES } from '../data/materials';
import { CATALOG_LABELS, CATALOG_MATERIALS } from '../data/pesticideCatalog';
import { isoNow } from '../lib/format';
import { newId } from '../lib/id';

/**
 * החומרים שהוזנו ידנית גוברים על המאגר המיובא: אם אותו מספר רישום
 * מופיע בשניהם, נשמרת הגרסה הידנית על תבניות הטיפול שלה.
 */
function mergedMaterials() {
  const manualRegistrations = new Set(MATERIALS.map((m) => m.registrationNumber));
  const manualNames = new Set(MATERIALS.map((m) => m.tradeName));
  const fromCatalog = CATALOG_MATERIALS.filter(
    (m) => !manualRegistrations.has(m.registrationNumber) && !manualNames.has(m.tradeName),
  );
  return [...MATERIALS, ...fromCatalog];
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
