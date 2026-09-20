import type { SyncEngine } from '@/lib/sync/engine';
import { contentFingerprint } from '@/lib/hash';
import {
  focusItemToDbRow,
  patchCachedVisit,
  putCachedFocusItems,
  putCachedRoute,
  putCachedVisit,
  removeCachedVisit,
  reorderCachedVisits,
  routeToDbRow,
  templateToDbRow,
  visitToDbRow,
} from './repo';
import type { FocusItemRow, RouteRow, RouteTemplateRow, RouteVisitRow } from './types';

/**
 * פעולות הכתיבה של מסלול העבודה.
 *
 * כל פעולה עושה שני דברים, בסדר הזה: מעדכנת את המטמון המקומי (כדי
 * שהמסך יגיב מיד וגם בלי קליטה), ואז מכניסה את הפעולה לתור הסנכרון.
 * מפתח האידמפוטנטיות נגזר מתוכן השורה, ולכן שליחה חוזרת של אותו תוכן
 * אינה יוצרת כפילות, ושינוי אמיתי כן נשלח.
 */

async function rowFingerprint(row: Record<string, unknown>): Promise<string> {
  return (await contentFingerprint(row)).slice(0, 16);
}

export async function saveVisit(syncEngine: SyncEngine, visit: RouteVisitRow): Promise<void> {
  await putCachedVisit(visit.routeId, visit);
  const row = visitToDbRow(visit);
  await syncEngine.enqueue('upsert_route_visit', visit.id, { row }, await rowFingerprint(row));
}

export async function patchVisit(
  syncEngine: SyncEngine,
  visit: RouteVisitRow,
  patch: Partial<RouteVisitRow>,
): Promise<RouteVisitRow> {
  const updated: RouteVisitRow = { ...visit, ...patch, updatedAt: new Date().toISOString() };
  await patchCachedVisit(visit.routeId, visit.id, patch);
  const row = visitToDbRow(updated);
  await syncEngine.enqueue('upsert_route_visit', visit.id, { row }, await rowFingerprint(row));
  return updated;
}

/**
 * הסרת תחנה מהמסלול. הלקוח עצמו נשאר במאגר — נמחק רק הביקור, ורק
 * כל עוד הוא לא התחיל (השרת אוכף זאת שוב בטריגר).
 */
export async function removeVisit(syncEngine: SyncEngine, visit: RouteVisitRow): Promise<void> {
  await removeCachedVisit(visit.routeId, visit.id);
  await syncEngine.enqueue('delete_route_visit', visit.id, { routeId: visit.routeId }, 'delete');
}

export async function applyReorder(syncEngine: SyncEngine, routeId: string, orderedIds: string[]): Promise<void> {
  await reorderCachedVisits(routeId, orderedIds);
  await syncEngine.enqueue(
    'reorder_route',
    routeId,
    { visitIds: orderedIds },
    await rowFingerprint({ orderedIds }),
  );
}

export async function saveFocusItem(
  syncEngine: SyncEngine,
  routeId: string,
  items: FocusItemRow[],
  changed: FocusItemRow,
): Promise<void> {
  await putCachedFocusItems(routeId, changed.visitId, items);
  const row = focusItemToDbRow(changed);
  await syncEngine.enqueue('upsert_focus_item', changed.id, { row }, await rowFingerprint(row));
}

export async function saveFocusItems(
  syncEngine: SyncEngine,
  routeId: string,
  visitId: string,
  items: FocusItemRow[],
): Promise<void> {
  await putCachedFocusItems(routeId, visitId, items);
  for (const item of items) {
    const row = focusItemToDbRow(item);
    await syncEngine.enqueue('upsert_focus_item', item.id, { row }, await rowFingerprint(row));
  }
}

export async function removeFocusItem(
  syncEngine: SyncEngine,
  routeId: string,
  remaining: FocusItemRow[],
  removed: FocusItemRow,
): Promise<void> {
  await putCachedFocusItems(routeId, removed.visitId, remaining);
  await syncEngine.enqueue('delete_focus_item', removed.id, { visitId: removed.visitId }, 'delete');
}

export async function saveRoute(syncEngine: SyncEngine, route: RouteRow): Promise<void> {
  await putCachedRoute(route);
  const row = routeToDbRow(route);
  await syncEngine.enqueue('upsert_route', route.id, { row }, await rowFingerprint(row));
}

export async function saveTemplate(syncEngine: SyncEngine, template: RouteTemplateRow): Promise<void> {
  const row = templateToDbRow(template);
  await syncEngine.enqueue('upsert_route_template', template.id, { row }, await rowFingerprint(row));
}
