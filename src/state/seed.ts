import type { AppState } from '../types';
import { MATERIALS, MATERIAL_LABELS, SYSTEM_TEMPLATES } from '../data/materials';
import { CATALOG_LABELS, CATALOG_MATERIALS } from '../data/pesticideCatalog';
import { isoNow } from '../lib/format';

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

export function seedState(): AppState {
  const userId = 'usr_yizhak';
  return {
    users: [{ id: userId, name: 'יצחק', role: 'admin', phone: '' }],
    exterminators: [
      { id: 'ext_yizhak', userId, name: 'יצחק', licenseNumber: '', phone: '' },
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
        id: 'aud_seed',
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
