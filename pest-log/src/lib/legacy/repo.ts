import { getSupabase, translateDbError } from '@/lib/supabase';
import { getCache, putCache } from '@/lib/db/idb';
import type { SyncEngine } from '@/lib/sync/engine';
import { contentFingerprint } from '@/lib/hash';
import { newUuid } from '@/lib/ids';
import { TEMPLATE_LIBRARIES, splitIntoPhrases, type TemplateKind } from '@/schema/textLibraries';
import type { SiteStationType } from '@/schema/sections';

/**
 * שכבת הנתונים של הפונקציות שהועברו מהגרסה הקודמת:
 * ספריות ניסוח, מאגר תחנות לאתר, ותכשירים ואצוות מיומנים אחרונים.
 * כמו בשאר המערכת: קריאה עם מטמון מקומי, כתיבה דרך תור הסנכרון.
 */

function fail(error: { code?: string; message: string }): never {
  throw new Error(translateDbError(error));
}

/* ── ספריות ניסוח ─────────────────────────────────────────────────────────── */

export interface TextTemplateRow {
  id: string;
  organizationId: string;
  kind: TemplateKind;
  body: string;
  source: 'saved' | 'learned';
  useCount: number;
}

export const TEMPLATES_CACHE_KEY = 'textTemplates';

export async function listTextTemplates(): Promise<TextTemplateRow[]> {
  try {
    const { data, error } = await getSupabase()
      .from('text_templates')
      .select('id, organization_id, kind, body, source, use_count')
      .is('deleted_at', null)
      .order('use_count', { ascending: false })
      .limit(1000);
    if (error) fail(error);
    const rows = (data ?? []).map((row) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      kind: row.kind as TemplateKind,
      body: row.body as string,
      source: row.source as 'saved' | 'learned',
      useCount: Number(row.use_count ?? 0),
    }));
    await putCache(TEMPLATES_CACHE_KEY, rows);
    return rows;
  } catch (error) {
    const cached = await getCache<TextTemplateRow[]>(TEMPLATES_CACHE_KEY);
    if (cached) return cached;
    throw error;
  }
}

async function cacheTemplates(rows: TextTemplateRow[]): Promise<void> {
  await putCache(TEMPLATES_CACHE_KEY, rows);
}

function templateRowToDb(row: TextTemplateRow): Record<string, unknown> {
  return {
    id: row.id,
    organization_id: row.organizationId,
    kind: row.kind,
    body: row.body,
    source: row.source,
    use_count: row.useCount,
  };
}

/** שמירת ניסוח כתבנית של העסק. מחזיר את הרשימה המעודכנת. */
export async function saveTextTemplate(
  syncEngine: SyncEngine,
  existing: TextTemplateRow[],
  organizationId: string,
  kind: TemplateKind,
  body: string,
  source: 'saved' | 'learned' = 'saved',
): Promise<TextTemplateRow[]> {
  const trimmed = body.trim();
  if (trimmed.length < 4) return existing;
  // אין טעם לשמור טקסט שכבר קיים — לא בספרייה המובנית ולא אצל העסק.
  if ((TEMPLATE_LIBRARIES[kind].items as readonly string[]).includes(trimmed)) return existing;
  if (existing.some((row) => row.kind === kind && row.body === trimmed)) return existing;

  const row: TextTemplateRow = {
    id: newUuid(),
    organizationId,
    kind,
    body: trimmed,
    source,
    useCount: 0,
  };
  const next = [...existing, row];
  await cacheTemplates(next);
  const dbRow = templateRowToDb(row);
  await syncEngine.enqueue(
    'upsert_text_template',
    row.id,
    { row: dbRow },
    (await contentFingerprint(dbRow)).slice(0, 16),
  );
  return next;
}

export async function deleteTextTemplate(
  syncEngine: SyncEngine,
  existing: TextTemplateRow[],
  id: string,
): Promise<TextTemplateRow[]> {
  const next = existing.filter((row) => row.id !== id);
  await cacheTemplates(next);
  await syncEngine.enqueue('delete_text_template', id, {}, 'delete');
  return next;
}

/**
 * למידת ניסוחים מיומן שהושלם — בדיוק כמו בגרסה הקודמת: כל טקסט שהמדביר
 * כתב בעצמו נשמר לפעם הבאה.
 */
export function collectLearnableTemplates(
  content: Record<string, unknown>,
): Array<{ kind: TemplateKind; body: string }> {
  const out: Array<{ kind: TemplateKind; body: string }> = [];
  const push = (kind: TemplateKind, value: unknown) => {
    for (const phrase of splitIntoPhrases(typeof value === 'string' ? value : null)) {
      out.push({ kind, body: phrase });
    }
  };

  const monitoring = (content.monitoring ?? {}) as Record<string, unknown>;
  for (const finding of Array.isArray(monitoring.findings) ? monitoring.findings : []) {
    push('finding_signs', (finding as Record<string, unknown>).infestationSigns);
  }

  const prevention = (content.prevention ?? {}) as Record<string, unknown>;
  push('circumstances', prevention.circumstancesForChoosingPestControl);
  for (const action of Array.isArray(prevention.actions) ? prevention.actions : []) {
    push('prevention', (action as Record<string, unknown>).description);
  }

  const preWarnings = (content.preWarnings ?? {}) as Record<string, unknown>;
  push('nature_before', preWarnings.treatmentNatureDescription);

  const postWarnings = (content.postWarnings ?? {}) as Record<string, unknown>;
  push('nature_after', postWarnings.treatmentPerformedDescription);
  push('warnings', postWarnings.afterTreatmentInfo);

  const warranty = (content.warranty ?? {}) as Record<string, unknown>;
  push('warranty', warranty.notes);

  return out;
}

/* ── מאגר תחנות לאתר ──────────────────────────────────────────────────────── */

export interface SiteStationRow {
  id: string;
  organizationId: string;
  clientSiteId: string | null;
  siteKey: string | null;
  stationNumber: number;
  stationType: SiteStationType;
  label: string | null;
  locationDescription: string | null;
  isActive: boolean;
}

const stationsCacheKey = (siteRef: string) => `siteStations:${siteRef}`;

/** מפתח אתר לטקסט חופשי — כשאין אתר שמור במאגר. */
export function siteKeyOf(clientName: string, placeText: string): string {
  const normalize = (value: string) =>
    value.replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return `${normalize(clientName)}|${normalize(placeText)}`;
}

export async function listSiteStations(
  siteId: string | null,
  siteKey: string | null,
): Promise<SiteStationRow[]> {
  const reference = siteId ?? siteKey ?? '';
  if (!reference) return [];
  try {
    let query = getSupabase()
      .from('site_stations')
      .select(
        'id, organization_id, client_site_id, site_key, station_number, station_type, label, location_description, is_active',
      )
      .is('deleted_at', null)
      .eq('is_active', true);
    query = siteId ? query.eq('client_site_id', siteId) : query.eq('site_key', siteKey as string);
    const { data, error } = await query.order('station_number');
    if (error) fail(error);
    const rows = (data ?? []).map((row) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      clientSiteId: (row.client_site_id as string | null) ?? null,
      siteKey: (row.site_key as string | null) ?? null,
      stationNumber: Number(row.station_number),
      stationType: row.station_type as SiteStationType,
      label: (row.label as string | null) ?? null,
      locationDescription: (row.location_description as string | null) ?? null,
      isActive: Boolean(row.is_active),
    }));
    await putCache(stationsCacheKey(reference), rows);
    return rows;
  } catch (error) {
    const cached = await getCache<SiteStationRow[]>(stationsCacheKey(reference));
    if (cached) return cached;
    throw error;
  }
}

function stationToDb(row: SiteStationRow): Record<string, unknown> {
  return {
    id: row.id,
    organization_id: row.organizationId,
    client_site_id: row.clientSiteId,
    site_key: row.siteKey,
    station_number: row.stationNumber,
    station_type: row.stationType,
    label: row.label,
    location_description: row.locationDescription,
    is_active: row.isActive,
  };
}

/** הוספת תחנה אחת או כמה, עם מספור עוקב שממשיך את המספר האחרון באתר. */
export async function addSiteStations(
  syncEngine: SyncEngine,
  existing: SiteStationRow[],
  params: {
    organizationId: string;
    clientSiteId: string | null;
    siteKey: string | null;
    stationType: SiteStationType;
    locationDescription: string;
    count: number;
  },
): Promise<SiteStationRow[]> {
  const count = Math.max(1, Math.min(60, Math.round(params.count)));
  let next = Math.max(0, ...existing.map((station) => station.stationNumber));
  const created: SiteStationRow[] = [];

  for (let index = 0; index < count; index += 1) {
    next += 1;
    created.push({
      id: newUuid(),
      organizationId: params.organizationId,
      clientSiteId: params.clientSiteId,
      siteKey: params.clientSiteId ? null : params.siteKey,
      stationNumber: next,
      stationType: params.stationType,
      label: null,
      locationDescription: params.locationDescription || null,
      isActive: true,
    });
  }

  const all = [...existing, ...created];
  const reference = params.clientSiteId ?? params.siteKey ?? '';
  if (reference) await putCache(stationsCacheKey(reference), all);

  for (const station of created) {
    const row = stationToDb(station);
    await syncEngine.enqueue(
      'upsert_site_station',
      station.id,
      { row },
      (await contentFingerprint(row)).slice(0, 16),
    );
  }
  return all;
}

export async function updateSiteStation(
  syncEngine: SyncEngine,
  existing: SiteStationRow[],
  station: SiteStationRow,
): Promise<SiteStationRow[]> {
  const next = existing.map((item) => (item.id === station.id ? station : item));
  const reference = station.clientSiteId ?? station.siteKey ?? '';
  if (reference) await putCache(stationsCacheKey(reference), next);
  const row = stationToDb(station);
  await syncEngine.enqueue(
    'upsert_site_station',
    station.id,
    { row },
    (await contentFingerprint(row)).slice(0, 16),
  );
  return next;
}

/**
 * הסרת תחנה. התחנה מסומנת כלא פעילה ואינה נמחקת, כדי שיומנים קודמים
 * שהתייחסו אליה יישארו קריאים — והמספור של שאר התחנות אינו משתנה.
 */
export async function removeSiteStation(
  syncEngine: SyncEngine,
  existing: SiteStationRow[],
  station: SiteStationRow,
): Promise<SiteStationRow[]> {
  const rows = await updateSiteStation(syncEngine, existing, { ...station, isActive: false });
  return rows.filter((item) => item.id !== station.id);
}

/* ── תכשירים ואצוות מיומנים אחרונים ───────────────────────────────────────── */

export interface RecentApplication {
  productTradeName: string;
  activeIngredientName: string | null;
  activeIngredientConcentrationPercent: number | null;
  batchNumber: string | null;
  applicationMethod: string | null;
  dosageUnit: string | null;
  readyToUse: boolean;
  /** מאיזה יומן נלקח — כדי שהמדביר יוכל לאמת. */
  serialNumber: number | null;
  completedAt: string | null;
}

export const RECENT_APPLICATIONS_CACHE_KEY = 'recentApplications';

/**
 * התכשירים והאצוות מהיומנים האחרונים שהושלמו.
 * המינון והמזיק אינם נלקחים משם: הם משתנים בין טיפולים, והעתקתם הייתה
 * הופכת את היומן ללא נכון.
 */
export async function listRecentApplications(limit = 25): Promise<RecentApplication[]> {
  try {
    const { data, error } = await getSupabase()
      .from('pest_logs')
      .select('serial_number, completed_at, snapshot')
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('completed_at', { ascending: false })
      .limit(limit);
    if (error) fail(error);

    const seen = new Set<string>();
    const out: RecentApplication[] = [];
    for (const row of data ?? []) {
      const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
      const applications = Array.isArray(snapshot.applications) ? snapshot.applications : [];
      for (const raw of applications) {
        const application = raw as Record<string, unknown>;
        const name =
          typeof application.productTradeName === 'string' ? application.productTradeName.trim() : '';
        if (!name) continue;
        const batch = typeof application.batchNumber === 'string' ? application.batchNumber.trim() : '';
        const key = `${name.toLowerCase()}|${batch.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          productTradeName: name,
          activeIngredientName:
            typeof application.activeIngredientName === 'string' ? application.activeIngredientName : null,
          activeIngredientConcentrationPercent:
            typeof application.activeIngredientConcentrationPercent === 'number'
              ? application.activeIngredientConcentrationPercent
              : null,
          batchNumber: batch || null,
          applicationMethod:
            typeof application.applicationMethod === 'string' ? application.applicationMethod : null,
          dosageUnit: typeof application.dosageUnit === 'string' ? application.dosageUnit : null,
          readyToUse: application.readyToUse === true,
          serialNumber: (row.serial_number as number | null) ?? null,
          completedAt: (row.completed_at as string | null) ?? null,
        });
      }
    }
    await putCache(RECENT_APPLICATIONS_CACHE_KEY, out);
    return out;
  } catch (error) {
    const cached = await getCache<RecentApplication[]>(RECENT_APPLICATIONS_CACHE_KEY);
    if (cached) return cached;
    throw error;
  }
}

/** האצוות שנרשמו בעבר לתכשיר מסוים — כהצעה, לא כמילוי אוטומטי. */
export function batchesForProduct(recent: RecentApplication[], productTradeName: string): string[] {
  const name = productTradeName.trim().toLowerCase();
  if (!name) return [];
  return [
    ...new Set(
      recent
        .filter((item) => item.productTradeName.trim().toLowerCase() === name && item.batchNumber)
        .map((item) => item.batchNumber as string),
    ),
  ].slice(0, 8);
}
