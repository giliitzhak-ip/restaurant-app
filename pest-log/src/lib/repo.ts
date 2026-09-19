import { getSupabase, translateDbError } from './supabase';
import { getCache, putCache } from './db/idb';
import type { OutboxOperation } from './db/idb';
import type { OperationOutcome } from './sync/engine';

/**
 * שכבת הגישה לנתונים.
 * כל קריאה נשמרת גם במטמון המקומי כדי שהמסכים יעבדו ללא קליטה.
 * כל הכתיבות עוברות דרך תור הסנכרון (ראו SyncEngine).
 */

export interface OrgProfile {
  id: string;
  organizationId: string;
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: 'owner' | 'manager' | 'exterminator' | 'viewer';
  organizationName: string;
  poisonCenterPhone: string;
}

export interface ClientRow {
  id: string;
  name: string;
  isPrivatePerson: boolean;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  contactRole: string | null;
  address: string | null;
}

export interface SiteRow {
  id: string;
  clientId: string;
  label: string;
  placeKind: 'dwelling' | 'open_area' | 'fogging_area';
  city: string | null;
  street: string | null;
  houseNumber: string | null;
  apartmentNumber: string | null;
  structureType: string | null;
  localAuthorityName: string | null;
  siteType: string | null;
  siteDescription: string | null;
  neighborhoodName: string | null;
  areaDescription: string | null;
  coordinates: unknown;
}

export interface ProductRow {
  id: string;
  tradeName: string;
  activeIngredientName: string;
  activeIngredientConcentrationPercent: number;
  readyToUse: boolean;
  registrationStatus: 'registered' | 'expired' | 'revoked' | 'unknown';
  registrationNumber: string | null;
  labelUrl: string | null;
  validUntil: string | null;
  approvedPests: string[];
  approvedApplicationMethods: string[];
  sourceName: string;
  sourceUrl: string | null;
  verifiedAt: string;
  isActive: boolean;
}

export interface WarningTemplateRow {
  id: string;
  title: string;
  productId: string | null;
  treatmentNatureDescription: string | null;
  risksToHumans: string | null;
  risksToAnimals: string | null;
  reEntryHours: number | null;
  additionalLabelInstructions: string | null;
  duringTreatmentInfo: string | null;
  afterTreatmentInfo: string | null;
  labelReference: string | null;
}

export interface PestCatalogRow {
  id: string;
  code: string;
  nameHe: string;
  nameScientific: string | null;
  groupName: string | null;
  sourceName: string;
  verifiedAt: string;
}

export interface ArchiveLogRow {
  id: string;
  serialNumber: number | null;
  status: 'draft' | 'completed' | 'cancelled';
  documentVersion: number;
  documentHash: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  correctsLogId: string | null;
  correctionReason: string | null;
  rootLogId: string | null;
  content: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
  version: number;
}

function fail(error: { code?: string; message: string }): never {
  throw new Error(translateDbError(error));
}

/** פרופיל המשתמש המחובר + פרטי הארגון. */
export async function loadProfile(): Promise<OrgProfile | null> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, organization_id, user_id, full_name, email, phone, role, organizations(name, poison_center_phone)')
    .eq('user_id', auth.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) fail(error);
  if (!data) return null;

  const org = (data.organizations ?? {}) as { name?: string; poison_center_phone?: string };
  const profile: OrgProfile = {
    id: data.id as string,
    organizationId: data.organization_id as string,
    userId: data.user_id as string,
    fullName: data.full_name as string,
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    role: data.role as OrgProfile['role'],
    organizationName: org.name ?? '',
    poisonCenterPhone: org.poison_center_phone ?? '04-7771900',
  };
  await putCache('profile', profile);
  return profile;
}

/** גרסת המטמון — לשימוש כשאין קליטה. */
export async function cachedProfile(): Promise<OrgProfile | undefined> {
  return getCache<OrgProfile>('profile');
}

async function loadCached<T>(cacheKey: string, loader: () => Promise<T>): Promise<T> {
  try {
    const value = await loader();
    await putCache(cacheKey, value);
    return value;
  } catch (error) {
    const cached = await getCache<T>(cacheKey);
    if (cached !== undefined) return cached;
    throw error;
  }
}

export async function listClients(): Promise<ClientRow[]> {
  return loadCached('clients', async () => {
    const { data, error } = await getSupabase()
      .from('clients')
      .select('id, name, is_private_person, phone, mobile, email, contact_role, address')
      .is('deleted_at', null)
      .order('name');
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      isPrivatePerson: Boolean(row.is_private_person),
      phone: (row.phone as string | null) ?? null,
      mobile: (row.mobile as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      contactRole: (row.contact_role as string | null) ?? null,
      address: (row.address as string | null) ?? null,
    }));
  });
}

export async function listSites(): Promise<SiteRow[]> {
  return loadCached('sites', async () => {
    const { data, error } = await getSupabase()
      .from('client_sites')
      .select(
        'id, client_id, label, place_kind, city, street, house_number, apartment_number, structure_type, local_authority_name, site_type, site_description, neighborhood_name, area_description, coordinates',
      )
      .is('deleted_at', null)
      .order('label');
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      clientId: row.client_id as string,
      label: row.label as string,
      placeKind: row.place_kind as SiteRow['placeKind'],
      city: (row.city as string | null) ?? null,
      street: (row.street as string | null) ?? null,
      houseNumber: (row.house_number as string | null) ?? null,
      apartmentNumber: (row.apartment_number as string | null) ?? null,
      structureType: (row.structure_type as string | null) ?? null,
      localAuthorityName: (row.local_authority_name as string | null) ?? null,
      siteType: (row.site_type as string | null) ?? null,
      siteDescription: (row.site_description as string | null) ?? null,
      neighborhoodName: (row.neighborhood_name as string | null) ?? null,
      areaDescription: (row.area_description as string | null) ?? null,
      coordinates: row.coordinates ?? null,
    }));
  });
}

export async function listProducts(): Promise<ProductRow[]> {
  return loadCached('products', async () => {
    const { data, error } = await getSupabase()
      .from('products')
      .select(
        'id, trade_name, active_ingredient_name, active_ingredient_concentration_percent, ready_to_use, registration_status, registration_number, label_url, valid_until, approved_pests, approved_application_methods, source_name, source_url, verified_at, is_active',
      )
      .is('deleted_at', null)
      .order('trade_name');
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      tradeName: row.trade_name as string,
      activeIngredientName: row.active_ingredient_name as string,
      activeIngredientConcentrationPercent: Number(row.active_ingredient_concentration_percent),
      readyToUse: Boolean(row.ready_to_use),
      registrationStatus: row.registration_status as ProductRow['registrationStatus'],
      registrationNumber: (row.registration_number as string | null) ?? null,
      labelUrl: (row.label_url as string | null) ?? null,
      validUntil: (row.valid_until as string | null) ?? null,
      approvedPests: (row.approved_pests as string[] | null) ?? [],
      approvedApplicationMethods: (row.approved_application_methods as string[] | null) ?? [],
      sourceName: row.source_name as string,
      sourceUrl: (row.source_url as string | null) ?? null,
      verifiedAt: row.verified_at as string,
      isActive: Boolean(row.is_active),
    }));
  });
}

export async function listWarningTemplates(): Promise<WarningTemplateRow[]> {
  return loadCached('warningTemplates', async () => {
    const { data, error } = await getSupabase()
      .from('warning_templates')
      .select(
        'id, title, product_id, treatment_nature_description, risks_to_humans, risks_to_animals, re_entry_hours, additional_label_instructions, during_treatment_info, after_treatment_info, label_reference',
      )
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('title');
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      productId: (row.product_id as string | null) ?? null,
      treatmentNatureDescription: (row.treatment_nature_description as string | null) ?? null,
      risksToHumans: (row.risks_to_humans as string | null) ?? null,
      risksToAnimals: (row.risks_to_animals as string | null) ?? null,
      reEntryHours: row.re_entry_hours === null ? null : Number(row.re_entry_hours),
      additionalLabelInstructions: (row.additional_label_instructions as string | null) ?? null,
      duringTreatmentInfo: (row.during_treatment_info as string | null) ?? null,
      afterTreatmentInfo: (row.after_treatment_info as string | null) ?? null,
      labelReference: (row.label_reference as string | null) ?? null,
    }));
  });
}

export async function listPestCatalog(): Promise<PestCatalogRow[]> {
  return loadCached('pestCatalog', async () => {
    const { data, error } = await getSupabase()
      .from('pest_catalog')
      .select('id, code, name_he, name_scientific, group_name, source_name, verified_at')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name_he');
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      code: row.code as string,
      nameHe: row.name_he as string,
      nameScientific: (row.name_scientific as string | null) ?? null,
      groupName: (row.group_name as string | null) ?? null,
      sourceName: row.source_name as string,
      verifiedAt: row.verified_at as string,
    }));
  });
}

/** ארכיון היומנים + חיפוש. */
export async function searchLogs(options: {
  query?: string;
  status?: 'draft' | 'completed' | 'cancelled';
  fromDate?: string;
  toDate?: string;
  limit?: number;
} = {}): Promise<ArchiveLogRow[]> {
  const supabase = getSupabase();
  let request = supabase
    .from('pest_logs')
    .select(
      'id, serial_number, status, document_version, document_hash, completed_at, created_at, updated_at, corrects_log_id, correction_reason, root_log_id, content, snapshot, version',
    )
    .is('deleted_at', null)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(options.limit ?? 100);

  if (options.status) request = request.eq('status', options.status);
  if (options.fromDate) request = request.gte('created_at', options.fromDate);
  if (options.toDate) request = request.lte('created_at', options.toDate);

  const { data, error } = await request;
  if (error) fail(error);

  const rows: ArchiveLogRow[] = (data ?? []).map((row) => ({
    id: row.id as string,
    serialNumber: (row.serial_number as number | null) ?? null,
    status: row.status as ArchiveLogRow['status'],
    documentVersion: Number(row.document_version),
    documentHash: (row.document_hash as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    correctsLogId: (row.corrects_log_id as string | null) ?? null,
    correctionReason: (row.correction_reason as string | null) ?? null,
    rootLogId: (row.root_log_id as string | null) ?? null,
    content: (row.content ?? {}) as Record<string, unknown>,
    snapshot: (row.snapshot ?? null) as Record<string, unknown> | null,
    version: Number(row.version),
  }));

  await putCache('archive', rows);
  if (!options.query) return rows;
  return filterLogsByText(rows, options.query);
}

/**
 * חיפוש טקסט חופשי על היומנים.
 * מופרד לפונקציה טהורה כדי שיפעל גם על המטמון המקומי, ללא קליטה.
 */
export function filterLogsByText(rows: ArchiveLogRow[], query: string): ArchiveLogRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    if (String(row.serialNumber ?? '').includes(needle)) return true;
    const haystack = JSON.stringify(row.snapshot ?? row.content).toLowerCase();
    return haystack.includes(needle);
  });
}

export async function cachedArchive(): Promise<ArchiveLogRow[]> {
  return (await getCache<ArchiveLogRow[]>('archive')) ?? [];
}

/** שרשרת הגרסאות של יומן (מקור + תיקונים). */
export async function loadLogVersions(rootLogId: string): Promise<ArchiveLogRow[]> {
  const { data, error } = await getSupabase()
    .from('pest_logs')
    .select(
      'id, serial_number, status, document_version, document_hash, completed_at, created_at, updated_at, corrects_log_id, correction_reason, root_log_id, content, snapshot, version',
    )
    .or(`id.eq.${rootLogId},root_log_id.eq.${rootLogId}`)
    .is('deleted_at', null)
    .order('document_version');
  if (error) fail(error);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    serialNumber: (row.serial_number as number | null) ?? null,
    status: row.status as ArchiveLogRow['status'],
    documentVersion: Number(row.document_version),
    documentHash: (row.document_hash as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    correctsLogId: (row.corrects_log_id as string | null) ?? null,
    correctionReason: (row.correction_reason as string | null) ?? null,
    rootLogId: (row.root_log_id as string | null) ?? null,
    content: (row.content ?? {}) as Record<string, unknown>,
    snapshot: (row.snapshot ?? null) as Record<string, unknown> | null,
    version: Number(row.version),
  }));
}

/* ── מבצע פעולות הסנכרון ──────────────────────────────────────────────────── */

/**
 * ממיר פעולה מהתור לקריאה מול Supabase.
 * זהו ה-executor שמוזרק ל-SyncEngine.
 */
export async function executeOperation(operation: OutboxOperation): Promise<OperationOutcome> {
  const supabase = getSupabase();

  try {
    switch (operation.type) {
      case 'upsert_draft': {
        const { data, error } = await supabase.rpc('upsert_pest_log_draft', {
          p_log_id: operation.entityId,
          p_org_id: operation.payload.organizationId as string,
          p_content: operation.payload.content as Record<string, unknown>,
          p_expected_version: (operation.payload.expectedVersion as number | null) ?? null,
          p_idempotency_key: operation.idempotencyKey,
          p_client_updated_at: operation.clientUpdatedAt,
          p_actor: null,
          p_client_id: (operation.payload.clientId as string | null) ?? null,
          p_client_site_id: (operation.payload.clientSiteId as string | null) ?? null,
        });
        if (error) {
          return {
            ok: false,
            error: translateDbError(error),
            conflict: error.code === 'P0004',
            permanent: error.code === '42501',
          };
        }
        const row = Array.isArray(data) ? data[0] : data;
        return { ok: true, serverVersion: row ? Number(row.version) : undefined };
      }

      case 'cancel_log': {
        const { error } = await supabase.rpc('cancel_pest_log', {
          p_log_id: operation.entityId,
          p_reason: operation.payload.reason as string,
          p_actor: null,
        });
        if (error) return { ok: false, error: translateDbError(error), permanent: error.code === '42501' };
        return { ok: true };
      }

      case 'upsert_client': {
        const { error } = await supabase
          .from('clients')
          .upsert(operation.payload.row as Record<string, unknown>, { onConflict: 'id' });
        if (error) return { ok: false, error: translateDbError(error), permanent: error.code === '42501' };
        return { ok: true };
      }

      case 'upsert_site': {
        const { error } = await supabase
          .from('client_sites')
          .upsert(operation.payload.row as Record<string, unknown>, { onConflict: 'id' });
        if (error) return { ok: false, error: translateDbError(error), permanent: error.code === '42501' };
        return { ok: true };
      }

      case 'upsert_bait_station': {
        const { error } = await supabase
          .from('bait_stations')
          .upsert(operation.payload.row as Record<string, unknown>, { onConflict: 'id' });
        if (error) return { ok: false, error: translateDbError(error), permanent: error.code === '42501' };
        return { ok: true };
      }

      // השלמה ותיקון עוברים דרך שירות השרת, שמריץ את ולידציית ה-Zod
      // ומפיק את ה-PDF. הלקוח לא יכול להשלים יומן בכוחות עצמו.
      case 'complete_log':
      case 'correct_log':
      case 'upload_attachment':
        return {
          ok: false,
          error: 'פעולה זו מתבצעת מול שירות השרת ולא דרך תור הסנכרון.',
          permanent: true,
        };

      default:
        return { ok: false, error: `סוג פעולה לא מוכר: ${operation.type}`, permanent: true };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
