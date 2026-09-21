import type { AppState } from '../types';
import { MATERIALS, MATERIAL_LABELS, SYSTEM_TEMPLATES } from '../data/materials';
import { isoNow } from '../lib/format';

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
    materials: MATERIALS,
    materialLabels: MATERIAL_LABELS,
    treatmentTemplates: SYSTEM_TEMPLATES,
    customerTemplates: [],
    routes: [],
    routeStops: [],
    tasks: [],
    baitStations: [],
    attachments: [],
    signatures: [],
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
