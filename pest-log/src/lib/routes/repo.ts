import { getSupabase, translateDbError } from '@/lib/supabase';
import { getCache, listAllOperations, putCache } from '@/lib/db/idb';
import type {
  FocusItemRow,
  RouteBundle,
  RouteRow,
  RouteTemplateRow,
  RouteVisitRow,
  TemplateStop,
  VisitHistoryRow,
} from './types';

/**
 * גישה לנתוני מסלול העבודה.
 *
 * כל קריאה נשמרת במטמון המקומי (IndexedDB) כדי שהמסלול יעבוד גם בלי
 * קליטה, וכל כתיבה עוברת דרך תור הסנכרון — כאן רק מעדכנים את המטמון
 * המקומי ומחזירים את השורה המעודכנת, והמסך מעביר את הפעולה לתור.
 */

function fail(error: { code?: string; message: string }): never {
  throw new Error(translateDbError(error));
}

const ROUTE_COLUMNS =
  'id, organization_id, template_id, name, route_kind, area_name, route_date, start_time, assigned_user_id, team_name, vehicle, start_point_address, start_point_coordinates, notes, status, order_locked, started_at, completed_at, updated_at';

const VISIT_COLUMNS =
  'id, organization_id, route_id, client_id, client_site_id, position, planned_date, planned_start_time, time_window_start, time_window_end, estimated_duration_minutes, service_type, frequency_days, priority, status, assigned_user_id, assigned_vehicle_id, arrival_at, started_at, completed_at, latitude, longitude, linked_pest_log_id, completion_notes, follow_up_required, postponed_to_date, postpone_reason, internal_notes, updated_at';

const FOCUS_COLUMNS =
  'id, organization_id, visit_id, category, title, details, site_location, importance, status, source, source_reference, approved, approved_at, assignee_id, due_date, is_internal, attachment_id, position, updated_at';

const TEMPLATE_COLUMNS =
  'id, organization_id, name, route_kind, area_name, weekday, default_start_time, default_team_name, default_vehicle, default_assignee_id, start_point_address, start_point_coordinates, stops, notes, is_active, updated_at';

type Row = Record<string, unknown>;

function coordinates(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Row;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/** HH:MM:SS → HH:MM, כדי שהטפסים והתצוגה יעבדו עם אותו פורמט. */
function timeOnly(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 5 ? value.slice(0, 5) : null;
}

export function mapRoute(row: Row): RouteRow {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    templateId: (row.template_id as string | null) ?? null,
    name: row.name as string,
    routeKind: row.route_kind as RouteRow['routeKind'],
    areaName: (row.area_name as string | null) ?? null,
    routeDate: row.route_date as string,
    startTime: timeOnly(row.start_time),
    assignedUserId: (row.assigned_user_id as string | null) ?? null,
    teamName: (row.team_name as string | null) ?? null,
    vehicle: (row.vehicle as string | null) ?? null,
    startPointAddress: (row.start_point_address as string | null) ?? null,
    startPointCoordinates: coordinates(row.start_point_coordinates),
    notes: (row.notes as string | null) ?? null,
    status: row.status as RouteRow['status'],
    orderLocked: Boolean(row.order_locked),
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

export function mapVisit(row: Row): RouteVisitRow {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    routeId: row.route_id as string,
    clientId: row.client_id as string,
    clientSiteId: (row.client_site_id as string | null) ?? null,
    position: Number(row.position),
    plannedDate: row.planned_date as string,
    plannedStartTime: timeOnly(row.planned_start_time),
    timeWindowStart: timeOnly(row.time_window_start),
    timeWindowEnd: timeOnly(row.time_window_end),
    estimatedDurationMinutes:
      row.estimated_duration_minutes === null || row.estimated_duration_minutes === undefined
        ? null
        : Number(row.estimated_duration_minutes),
    serviceType: (row.service_type as string | null) ?? null,
    frequencyDays:
      row.frequency_days === null || row.frequency_days === undefined ? null : Number(row.frequency_days),
    priority: row.priority as RouteVisitRow['priority'],
    status: row.status as RouteVisitRow['status'],
    assignedUserId: (row.assigned_user_id as string | null) ?? null,
    assignedVehicleId: (row.assigned_vehicle_id as string | null) ?? null,
    arrivalAt: (row.arrival_at as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    linkedPestLogId: (row.linked_pest_log_id as string | null) ?? null,
    completionNotes: (row.completion_notes as string | null) ?? null,
    followUpRequired: Boolean(row.follow_up_required),
    postponedToDate: (row.postponed_to_date as string | null) ?? null,
    postponeReason: (row.postpone_reason as string | null) ?? null,
    internalNotes: (row.internal_notes as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

export function mapFocusItem(row: Row): FocusItemRow {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    visitId: row.visit_id as string,
    category: row.category as FocusItemRow['category'],
    title: row.title as string,
    details: (row.details as string | null) ?? null,
    siteLocation: (row.site_location as string | null) ?? null,
    importance: row.importance as FocusItemRow['importance'],
    status: row.status as FocusItemRow['status'],
    source: row.source as FocusItemRow['source'],
    sourceReference: (row.source_reference as Record<string, unknown> | null) ?? {},
    approved: Boolean(row.approved),
    approvedAt: (row.approved_at as string | null) ?? null,
    assigneeId: (row.assignee_id as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    isInternal: Boolean(row.is_internal),
    attachmentId: (row.attachment_id as string | null) ?? null,
    position: Number(row.position),
    updatedAt: row.updated_at as string,
  };
}

export function mapTemplate(row: Row): RouteTemplateRow {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    routeKind: row.route_kind as RouteTemplateRow['routeKind'],
    areaName: (row.area_name as string | null) ?? null,
    weekday: row.weekday === null || row.weekday === undefined ? null : Number(row.weekday),
    defaultStartTime: timeOnly(row.default_start_time),
    defaultTeamName: (row.default_team_name as string | null) ?? null,
    defaultVehicle: (row.default_vehicle as string | null) ?? null,
    defaultAssigneeId: (row.default_assignee_id as string | null) ?? null,
    startPointAddress: (row.start_point_address as string | null) ?? null,
    startPointCoordinates: coordinates(row.start_point_coordinates),
    stops: Array.isArray(row.stops) ? (row.stops as TemplateStop[]) : [],
    notes: (row.notes as string | null) ?? null,
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at as string,
  };
}

/* ── קריאה ────────────────────────────────────────────────────────────────── */

export const ROUTES_CACHE_KEY = 'routes';
export const TEMPLATES_CACHE_KEY = 'routeTemplates';
export const routeBundleCacheKey = (routeId: string) => `routeBundle:${routeId}`;

async function readThroughCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  try {
    const value = await loader();
    await putCache(key, value);
    return value;
  } catch (error) {
    const cached = await getCache<T>(key);
    if (cached !== undefined) return cached;
    throw error;
  }
}

/**
 * טעינה מהשרת עם שמירה במטמון, אבל בלי נפילה שקטה אליו.
 * המסכים של המסלול חייבים לדעת שהם מציגים עותק מקומי, כדי להציג זאת
 * למשתמש — ולכן כאן השגיאה עוברת הלאה, והקורא בוחר את המטמון במפורש.
 */
async function fetchAndCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const value = await loader();
  await putCache(key, value);
  return value;
}

/** כל המסלולים בטווח תאריכים. ללא טווח — 30 יום אחורה ו-60 קדימה. */
export async function listRoutes(fromDate?: string, toDate?: string): Promise<RouteRow[]> {
  return fetchAndCache(ROUTES_CACHE_KEY, async () => {
    let query = getSupabase().from('maintenance_routes').select(ROUTE_COLUMNS).is('deleted_at', null);
    if (fromDate) query = query.gte('route_date', fromDate);
    if (toDate) query = query.lte('route_date', toDate);
    const { data, error } = await query.order('route_date', { ascending: false }).limit(300);
    if (error) fail(error);
    return (data ?? []).map((row) => mapRoute(row as Row));
  });
}

export async function cachedRoutes(): Promise<RouteRow[]> {
  return (await getCache<RouteRow[]>(ROUTES_CACHE_KEY)) ?? [];
}

/**
 * מסלול מלא עם התחנות והדגשים.
 * נשמר במטמון כיחידה אחת — זו ההורדה מראש שמאפשרת לעבוד בלי קליטה.
 */
export async function loadRouteBundle(routeId: string): Promise<RouteBundle> {
  return fetchAndCache(routeBundleCacheKey(routeId), async () => {
    const supabase = getSupabase();
    const [routeResult, visitsResult] = await Promise.all([
      supabase.from('maintenance_routes').select(ROUTE_COLUMNS).eq('id', routeId).maybeSingle(),
      supabase
        .from('route_visits')
        .select(VISIT_COLUMNS)
        .eq('route_id', routeId)
        .is('deleted_at', null)
        .order('position'),
    ]);
    if (routeResult.error) fail(routeResult.error);
    if (!routeResult.data) throw new Error('המסלול לא נמצא');
    if (visitsResult.error) fail(visitsResult.error);

    const visits = (visitsResult.data ?? []).map((row) => mapVisit(row as Row));
    const focusByVisit: Record<string, FocusItemRow[]> = {};

    if (visits.length > 0) {
      const { data, error } = await supabase
        .from('visit_focus_items')
        .select(FOCUS_COLUMNS)
        .in(
          'visit_id',
          visits.map((visit) => visit.id),
        )
        .is('deleted_at', null)
        .order('position');
      if (error) fail(error);
      for (const row of data ?? []) {
        const item = mapFocusItem(row as Row);
        (focusByVisit[item.visitId] ??= []).push(item);
      }
    }

    return overlayPendingOperations({ route: mapRoute(routeResult.data as Row), visits, focusByVisit });
  });
}

/**
 * מיזוג שינויים מקומיים שטרם סונכרנו על גבי הנתונים מהשרת.
 *
 * בלי זה, רענון מיד אחרי פעולה בשטח היה מציג שוב את המצב הישן: השרת
 * עדיין לא קיבל את הפעולה, אבל היא כבר בתור. מה שבתור הוא האמת של
 * המכשיר, ולכן הוא גובר עד שהסנכרון מסתיים.
 */
export async function overlayPendingOperations(bundle: RouteBundle): Promise<RouteBundle> {
  // כולל פעולות שנמצאות כרגע בשליחה: עד שהשרת מאשר, מה שבמכשיר הוא
  // המצב הנכון, ואחרת רענון באמצע השליחה היה מציג שוב את הסטטוס הישן.
  const pending = await listAllOperations();
  if (pending.length === 0) return bundle;

  let visits = bundle.visits;
  const focusByVisit = { ...bundle.focusByVisit };
  const removedVisits = new Set<string>();
  const removedFocus = new Set<string>();

  for (const operation of pending) {
    switch (operation.type) {
      case 'upsert_route_visit': {
        const row = operation.payload.row as Row | undefined;
        if (!row || row.route_id !== bundle.route.id) break;
        const visit = mapVisit(row);
        visits = visits.some((item) => item.id === visit.id)
          ? visits.map((item) => (item.id === visit.id ? visit : item))
          : [...visits, visit];
        break;
      }
      case 'delete_route_visit':
        removedVisits.add(operation.entityId);
        break;
      case 'reorder_route': {
        if (operation.entityId !== bundle.route.id) break;
        const order = operation.payload.visitIds as string[];
        visits = visits.map((visit) => {
          const index = order.indexOf(visit.id);
          return index === -1 ? visit : { ...visit, position: index + 1 };
        });
        break;
      }
      case 'upsert_focus_item': {
        const row = operation.payload.row as Row | undefined;
        if (!row) break;
        const item = mapFocusItem(row);
        const current = focusByVisit[item.visitId] ?? [];
        focusByVisit[item.visitId] = current.some((existing) => existing.id === item.id)
          ? current.map((existing) => (existing.id === item.id ? item : existing))
          : [...current, item];
        break;
      }
      case 'delete_focus_item':
        removedFocus.add(operation.entityId);
        break;
      default:
        break;
    }
  }

  const merged: RouteBundle = {
    route: bundle.route,
    visits: visits.filter((visit) => !removedVisits.has(visit.id)).sort((a, b) => a.position - b.position),
    focusByVisit: Object.fromEntries(
      Object.entries(focusByVisit).map(([visitId, items]) => [
        visitId,
        items.filter((item) => !removedFocus.has(item.id)),
      ]),
    ),
  };
  return merged;
}

export async function cachedRouteBundle(routeId: string): Promise<RouteBundle | undefined> {
  return getCache<RouteBundle>(routeBundleCacheKey(routeId));
}

export async function listRouteTemplates(): Promise<RouteTemplateRow[]> {
  return readThroughCache(TEMPLATES_CACHE_KEY, async () => {
    const { data, error } = await getSupabase()
      .from('route_templates')
      .select(TEMPLATE_COLUMNS)
      .is('deleted_at', null)
      .order('name');
    if (error) fail(error);
    return (data ?? []).map((row) => mapTemplate(row as Row));
  });
}

export async function listVisitHistory(visitId: string): Promise<VisitHistoryRow[]> {
  const { data, error } = await getSupabase()
    .from('visit_status_history')
    .select('id, visit_id, route_id, action, from_status, to_status, from_position, to_position, reason, changed_at')
    .eq('visit_id', visitId)
    .order('changed_at', { ascending: false })
    .limit(100);
  if (error) fail(error);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    visitId: (row.visit_id as string | null) ?? null,
    routeId: row.route_id as string,
    action: row.action as string,
    fromStatus: (row.from_status as string | null) ?? null,
    toStatus: (row.to_status as string | null) ?? null,
    fromPosition: (row.from_position as number | null) ?? null,
    toPosition: (row.to_position as number | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    changedAt: row.changed_at as string,
  }));
}

/** היומנים הקודמים של הלקוח/האתר — להיסטוריה בכרטיס הלקוח ולהצעת דגשים. */
export interface ClientHistoryLog {
  id: string;
  serialNumber: number | null;
  completedAt: string | null;
  snapshot: Record<string, unknown> | null;
}

export async function listClientHistory(clientId: string, limit = 5): Promise<ClientHistoryLog[]> {
  return readThroughCache(`clientHistory:${clientId}`, async () => {
    const { data, error } = await getSupabase()
      .from('pest_logs')
      .select('id, serial_number, completed_at, snapshot')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('completed_at', { ascending: false })
      .limit(limit);
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      serialNumber: (row.serial_number as number | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
      snapshot: (row.snapshot as Record<string, unknown> | null) ?? null,
    }));
  });
}

/* ── כתיבה למטמון המקומי (הסנכרון מתבצע דרך התור) ─────────────────────────── */

export async function patchCachedVisit(
  routeId: string,
  visitId: string,
  patch: Partial<RouteVisitRow>,
): Promise<RouteVisitRow | null> {
  const bundle = await cachedRouteBundle(routeId);
  if (!bundle) return null;
  let updated: RouteVisitRow | null = null;
  const visits = bundle.visits.map((visit) => {
    if (visit.id !== visitId) return visit;
    updated = { ...visit, ...patch, updatedAt: new Date().toISOString() };
    return updated;
  });
  await putCache(routeBundleCacheKey(routeId), { ...bundle, visits });
  return updated;
}

export async function putCachedVisit(routeId: string, visit: RouteVisitRow): Promise<void> {
  const bundle = await cachedRouteBundle(routeId);
  if (!bundle) return;
  const exists = bundle.visits.some((item) => item.id === visit.id);
  const visits = exists
    ? bundle.visits.map((item) => (item.id === visit.id ? visit : item))
    : [...bundle.visits, visit];
  await putCache(routeBundleCacheKey(routeId), {
    ...bundle,
    visits: visits.slice().sort((a, b) => a.position - b.position),
  });
}

export async function removeCachedVisit(routeId: string, visitId: string): Promise<void> {
  const bundle = await cachedRouteBundle(routeId);
  if (!bundle) return;
  const { [visitId]: _removed, ...focusByVisit } = bundle.focusByVisit;
  await putCache(routeBundleCacheKey(routeId), {
    ...bundle,
    visits: bundle.visits.filter((visit) => visit.id !== visitId),
    focusByVisit,
  });
}

export async function reorderCachedVisits(routeId: string, orderedIds: string[]): Promise<void> {
  const bundle = await cachedRouteBundle(routeId);
  if (!bundle) return;
  const byId = new Map(bundle.visits.map((visit) => [visit.id, visit]));
  const visits = orderedIds
    .map((id, index) => {
      const visit = byId.get(id);
      return visit ? { ...visit, position: index + 1 } : null;
    })
    .filter((visit): visit is RouteVisitRow => visit !== null);
  await putCache(routeBundleCacheKey(routeId), { ...bundle, visits });
}

export async function putCachedFocusItems(routeId: string, visitId: string, items: FocusItemRow[]): Promise<void> {
  const bundle = await cachedRouteBundle(routeId);
  if (!bundle) return;
  await putCache(routeBundleCacheKey(routeId), {
    ...bundle,
    focusByVisit: { ...bundle.focusByVisit, [visitId]: items },
  });
}

export async function putCachedRoute(route: RouteRow): Promise<void> {
  const bundle = await cachedRouteBundle(route.id);
  if (bundle) await putCache(routeBundleCacheKey(route.id), { ...bundle, route });
  const routes = await cachedRoutes();
  const exists = routes.some((item) => item.id === route.id);
  await putCache(
    ROUTES_CACHE_KEY,
    exists ? routes.map((item) => (item.id === route.id ? route : item)) : [route, ...routes],
  );
}

/* ── המרה לשורות מסד הנתונים (לתור הסנכרון) ───────────────────────────────── */

export function visitToDbRow(visit: RouteVisitRow): Record<string, unknown> {
  return {
    id: visit.id,
    organization_id: visit.organizationId,
    route_id: visit.routeId,
    client_id: visit.clientId,
    client_site_id: visit.clientSiteId,
    position: visit.position,
    planned_date: visit.plannedDate,
    planned_start_time: visit.plannedStartTime,
    time_window_start: visit.timeWindowStart,
    time_window_end: visit.timeWindowEnd,
    estimated_duration_minutes: visit.estimatedDurationMinutes,
    service_type: visit.serviceType,
    frequency_days: visit.frequencyDays,
    priority: visit.priority,
    status: visit.status,
    assigned_user_id: visit.assignedUserId,
    assigned_vehicle_id: visit.assignedVehicleId,
    arrival_at: visit.arrivalAt,
    started_at: visit.startedAt,
    completed_at: visit.completedAt,
    latitude: visit.latitude,
    longitude: visit.longitude,
    linked_pest_log_id: visit.linkedPestLogId,
    completion_notes: visit.completionNotes,
    follow_up_required: visit.followUpRequired,
    postponed_to_date: visit.postponedToDate,
    postpone_reason: visit.postponeReason,
    internal_notes: visit.internalNotes,
  };
}

export function focusItemToDbRow(item: FocusItemRow): Record<string, unknown> {
  return {
    id: item.id,
    organization_id: item.organizationId,
    visit_id: item.visitId,
    category: item.category,
    title: item.title,
    details: item.details,
    site_location: item.siteLocation,
    importance: item.importance,
    status: item.status,
    source: item.source,
    source_reference: item.sourceReference,
    approved: item.approved,
    approved_at: item.approvedAt,
    assignee_id: item.assigneeId,
    due_date: item.dueDate,
    is_internal: item.isInternal,
    attachment_id: item.attachmentId,
    position: item.position,
  };
}

export function routeToDbRow(route: RouteRow): Record<string, unknown> {
  return {
    id: route.id,
    organization_id: route.organizationId,
    template_id: route.templateId,
    name: route.name,
    route_kind: route.routeKind,
    area_name: route.areaName,
    route_date: route.routeDate,
    start_time: route.startTime,
    assigned_user_id: route.assignedUserId,
    team_name: route.teamName,
    vehicle: route.vehicle,
    start_point_address: route.startPointAddress,
    start_point_coordinates: route.startPointCoordinates,
    notes: route.notes,
    status: route.status,
    order_locked: route.orderLocked,
    started_at: route.startedAt,
    completed_at: route.completedAt,
  };
}

export function templateToDbRow(template: RouteTemplateRow): Record<string, unknown> {
  return {
    id: template.id,
    organization_id: template.organizationId,
    name: template.name,
    route_kind: template.routeKind,
    area_name: template.areaName,
    weekday: template.weekday,
    default_start_time: template.defaultStartTime,
    default_team_name: template.defaultTeamName,
    default_vehicle: template.defaultVehicle,
    default_assignee_id: template.defaultAssigneeId,
    start_point_address: template.startPointAddress,
    start_point_coordinates: template.startPointCoordinates,
    stops: template.stops,
    notes: template.notes,
    is_active: template.isActive,
  };
}

/** יצירת מסלול מתבנית — פעולת שרת אטומית. מחייבת חיבור. */
export async function generateRouteFromTemplate(
  templateId: string,
  routeDate: string,
  assignedUserId: string | null,
): Promise<{ routeId: string; created: number; skipped: number }> {
  const { data, error } = await getSupabase().rpc('generate_route_from_template', {
    p_template_id: templateId,
    p_route_date: routeDate,
    p_assigned_user: assignedUserId,
    p_route_id: null,
  });
  if (error) fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  return {
    routeId: (row?.route_id as string) ?? '',
    created: Number(row?.created_stops ?? 0),
    skipped: Number(row?.skipped_stops ?? 0),
  };
}

/** חברי הארגון — לשיוך מסלולים ולהצגת שם העובד האחראי. */
export interface OrgMember {
  id: string;
  fullName: string;
  role: string;
}

export async function listOrgMembers(): Promise<OrgMember[]> {
  return readThroughCache('orgMembers', async () => {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('id, full_name, role')
      .is('deleted_at', null)
      .order('full_name');
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      role: row.role as string,
    }));
  });
}
