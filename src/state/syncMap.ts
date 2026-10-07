import type { AppState } from '../types';

/**
 * מה מסונכרן לשרת, ואיך כל אוסף במכשיר נקרא בצד השרת.
 *
 * הסנכרון נגזר מהפרש המצב ולא מקריאה ידנית בכל פעולה: כך פעולה חדשה
 * בחנות מסונכרנת מעצמה, ואי אפשר "לשכוח" לשלוח שינוי.
 *
 * מאגר התכשירים והתוויות (materials, materialLabels) אינו מסונכרן:
 * הוא מגיע עם גרסת הקוד וזהה לכל העסקים.
 */
export const SYNCED_COLLECTIONS: readonly { key: keyof AppState; entity: string }[] = [
  { key: 'exterminators', entity: 'exterminators' },
  { key: 'customers', entity: 'customers' },
  { key: 'sites', entity: 'customer_sites' },
  { key: 'journals', entity: 'journals' },
  { key: 'journalPests', entity: 'journal_pests' },
  { key: 'journalActions', entity: 'journal_actions' },
  { key: 'journalMaterials', entity: 'journal_materials' },
  { key: 'baitStations', entity: 'bait_stations' },
  { key: 'signatures', entity: 'signatures' },
  { key: 'attachments', entity: 'attachments' },
  { key: 'treatmentTemplates', entity: 'treatment_templates' },
  { key: 'customerTemplates', entity: 'customer_templates' },
  { key: 'routes', entity: 'routes' },
  { key: 'routeStops', entity: 'route_stops' },
  { key: 'tasks', entity: 'tasks' },
  { key: 'journalSnapshots', entity: 'journal_snapshots' },
  { key: 'auditLog', entity: 'audit_log' },
];

const ENTITY_BY_KEY = new Map(SYNCED_COLLECTIONS.map((c) => [c.key, c.entity]));
const KEY_BY_ENTITY = new Map(SYNCED_COLLECTIONS.map((c) => [c.entity, c.key]));

export function entityOf(key: keyof AppState): string | undefined {
  return ENTITY_BY_KEY.get(key);
}

export function collectionOf(entity: string): keyof AppState | undefined {
  return KEY_BY_ENTITY.get(entity);
}

interface Identified { id: string }

/** צילום של כל הרשומות המסונכרנות, לפי ישות ומזהה. */
export type SyncSnapshot = Map<string, Map<string, Identified>>;

export function snapshotState(state: AppState): SyncSnapshot {
  const snapshot: SyncSnapshot = new Map();
  for (const { key, entity } of SYNCED_COLLECTIONS) {
    const rows = (state[key] ?? []) as unknown as Identified[];
    const byId = new Map<string, Identified>();
    for (const row of rows) {
      if (row && typeof row.id === 'string') byId.set(row.id, row);
    }
    snapshot.set(entity, byId);
  }
  return snapshot;
}

export interface SyncDiff {
  upserts: { entity: string; id: string; record: unknown }[];
  deletes: { entity: string; id: string }[];
}

/**
 * הפרש בין שני צילומים. ההשוואה היא לפי זהות האובייקט, כי החנות
 * מעדכנת מצב באופן בלתי-משתנה: רשומה שלא נגעו בה שומרת על אותה הפניה.
 * השוואה כזו זולה דיה כדי לרוץ בכל שינוי מצב, כולל הקלדה.
 */
export function diffSnapshots(prev: SyncSnapshot, next: SyncSnapshot): SyncDiff {
  const diff: SyncDiff = { upserts: [], deletes: [] };
  for (const [entity, nextById] of next) {
    const prevById = prev.get(entity) ?? new Map<string, Identified>();
    for (const [id, record] of nextById) {
      if (prevById.get(id) !== record) diff.upserts.push({ entity, id, record });
    }
    for (const id of prevById.keys()) {
      if (!nextById.has(id)) diff.deletes.push({ entity, id });
    }
  }
  return diff;
}

export interface PulledChanges {
  items: Record<string, Record<string, unknown>[]>;
  deleted: Record<string, string[]>;
}

export interface MergeOutcome {
  state: AppState;
  added: number;
  updated: number;
  removed: number;
  /** שינויים מהשרת שלא הוחלו, כי יש שינוי מקומי שעדיין לא נשלח. */
  skipped: number;
}

/**
 * מיזוג שינויים מהשרת אל המצב המקומי.
 *
 * הכלל: שינוי מקומי שעדיין לא נשלח לשרת גובר, כדי שלא יימחק מידע
 * שהוקלד בשטח. בכל מקרה אחר גרסת השרת היא הגרסה המשותפת.
 * אין מיזוג ברמת שדה – זו מגבלה מתועדת, לא התנהגות שהוכחה.
 */
export function mergePulled(
  state: AppState,
  pulled: PulledChanges,
  hasPending: (entity: string, id: string) => boolean,
): MergeOutcome {
  let added = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;
  const patch: Partial<AppState> = {};

  for (const { key, entity } of SYNCED_COLLECTIONS) {
    const incoming = pulled.items?.[entity] ?? [];
    const gone = pulled.deleted?.[entity] ?? [];
    if (incoming.length === 0 && gone.length === 0) continue;

    const rows = [...((state[key] ?? []) as unknown as Identified[])];
    const indexById = new Map(rows.map((row, i) => [row.id, i]));
    let touched = false;

    for (const record of incoming) {
      const id = String(record.id ?? '');
      if (!id) continue;
      if (hasPending(entity, id)) { skipped += 1; continue; }
      const at = indexById.get(id);
      if (at === undefined) {
        rows.push(record as unknown as Identified);
        indexById.set(id, rows.length - 1);
        added += 1;
      } else {
        rows[at] = record as unknown as Identified;
        updated += 1;
      }
      touched = true;
    }

    const removeIds = new Set<string>();
    for (const id of gone) {
      if (hasPending(entity, id)) { skipped += 1; continue; }
      if (indexById.has(id)) removeIds.add(id);
    }
    if (removeIds.size > 0) {
      removed += removeIds.size;
      touched = true;
    }

    if (!touched) continue;
    const next = removeIds.size > 0 ? rows.filter((row) => !removeIds.has(row.id)) : rows;
    (patch as Record<string, unknown>)[key] = next;
  }

  if (added + updated + removed === 0) return { state, added, updated, removed, skipped };
  return { state: { ...state, ...patch }, added, updated, removed, skipped };
}
