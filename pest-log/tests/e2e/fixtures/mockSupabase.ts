import type { Page, Route } from '@playwright/test';

/**
 * שכבת Supabase מדומה ברמת הרשת.
 *
 * למה ברמת הרשת ולא ע"י הזרקת מוק לקוד: כך נבדק הקוד האמיתי של
 * האפליקציה — הלקוח, מנוע הסנכרון, IndexedDB והאשף — ורק הגבול החיצוני
 * מוחלף. הכפתורים מפעילים את הזרימה האמיתית.
 */

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-9000-00000000000a';

export const MOCK = { orgId: ORG_ID, userId: USER_ID, email: 'exterminator-a@example.test' };

type Row = Record<string, unknown>;

export interface ServerState {
  logs: Map<
    string,
    { content: unknown; version: number; status: string; serialNumber: number | null; snapshot?: unknown }
  >;
  /** מסלול העבודה: מסלולים, תחנות ודגשים. */
  routes: Map<string, Row>;
  /** ספריות ניסוח ומאגר תחנות — הפונקציות שהועברו מהגרסה הקודמת. */
  textTemplates: Map<string, Row>;
  siteStations: Map<string, Row>;
  visits: Map<string, Row>;
  focus: Map<string, Row>;
  templates: Map<string, Row>;
  reorderCalls: string[][];
  /** מפתחות האידמפוטנטיות שהגיעו לשרת — לזיהוי כפילויות. */
  upsertCalls: string[];
  completeCalls: string[];
  nextSerial: number;
  /** כיבוי מדמה ניתוק רשת. */
  online: boolean;
}

const SESSION = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'exterminator-a@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*', date: new Date().toUTCString() },
    body: JSON.stringify(body),
  });
}

export async function installSupabaseMock(page: Page): Promise<ServerState> {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const state: ServerState = {
    logs: new Map(),
    routes: new Map(),
    textTemplates: new Map(),
    siteStations: new Map(),
    visits: new Map(),
    focus: new Map(),
    templates: new Map(),
    reorderCalls: [],
    upsertCalls: [],
    completeCalls: [],
    nextSerial: 1,
    online: true,
  };

  const CLIENT_A = '00000000-0000-4000-c000-000000000002';
  const CLIENT_B = '00000000-0000-4000-c000-000000000003';
  const SITE_A = '00000000-0000-4000-d000-000000000001';
  const SITE_A2 = '00000000-0000-4000-d000-000000000002';
  const SITE_B = '00000000-0000-4000-d000-000000000003';
  const ROUTE_ID = '00000000-0000-4000-f000-000000000001';
  const VISIT_A = '00000000-0000-4000-f000-00000000000a';
  const VISIT_B = '00000000-0000-4000-f000-00000000000b';

  state.routes.set(ROUTE_ID, {
    id: ROUTE_ID,
    organization_id: ORG_ID,
    template_id: null,
    name: 'קו ירושלים — יום ראשון',
    route_kind: 'maintenance_line',
    area_name: 'ירושלים',
    route_date: todayIso,
    start_time: '08:00:00',
    assigned_user_id: '00000000-0000-4000-a000-00000000000a',
    team_name: null,
    vehicle: 'רכב 1',
    start_point_address: 'מחסן העסק',
    start_point_coordinates: { latitude: 31.78, longitude: 35.21 },
    notes: null,
    status: 'planned',
    order_locked: false,
    started_at: null,
    completed_at: null,
    updated_at: new Date().toISOString(),
  });

  state.visits.set(VISIT_A, {
    id: VISIT_A,
    organization_id: ORG_ID,
    route_id: ROUTE_ID,
    client_id: CLIENT_A,
    client_site_id: SITE_A,
    position: 1,
    planned_date: todayIso,
    planned_start_time: '08:30:00',
    time_window_start: null,
    time_window_end: null,
    estimated_duration_minutes: 45,
    service_type: 'אחזקה חודשית',
    frequency_days: 30,
    priority: 'normal',
    status: 'pending',
    assigned_user_id: '00000000-0000-4000-a000-00000000000a',
    assigned_vehicle_id: 'רכב 1',
    arrival_at: null,
    started_at: null,
    completed_at: null,
    latitude: 31.79,
    longitude: 35.22,
    linked_pest_log_id: null,
    completion_notes: null,
    follow_up_required: false,
    postponed_to_date: null,
    postpone_reason: null,
    internal_notes: null,
    updated_at: new Date().toISOString(),
  });

  state.visits.set(VISIT_B, {
    ...(state.visits.get(VISIT_A) as Row),
    id: VISIT_B,
    client_id: CLIENT_B,
    client_site_id: SITE_B,
    position: 2,
    planned_start_time: '10:00:00',
    priority: 'urgent',
    service_type: 'טיפול יזום',
    latitude: 31.74,
    longitude: 35.19,
  });

  state.templates.set('00000000-0000-4000-f000-0000000000c1', {
    id: '00000000-0000-4000-f000-0000000000c1',
    organization_id: ORG_ID,
    name: 'קו ירושלים — יום ראשון',
    route_kind: 'maintenance_line',
    area_name: 'ירושלים',
    weekday: 0,
    default_start_time: '08:00:00',
    default_team_name: null,
    default_vehicle: 'רכב 1',
    default_assignee_id: '00000000-0000-4000-a000-00000000000a',
    start_point_address: 'מחסן העסק',
    start_point_coordinates: { latitude: 31.78, longitude: 35.21 },
    stops: [
      { clientId: CLIENT_A, clientSiteId: SITE_A, position: 1, serviceType: 'אחזקה חודשית', frequencyDays: 30 },
      { clientId: CLIENT_B, clientSiteId: SITE_B, position: 2, serviceType: 'טיפול יזום', frequencyDays: 90 },
    ],
    notes: null,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  const SITES: Row[] = [
    {
      id: SITE_A,
      client_id: CLIENT_A,
      label: 'אתר ראשי — לקוח א׳',
      place_kind: 'dwelling',
      city: 'ירושלים',
      street: 'רחוב הדוגמה',
      house_number: '12',
      apartment_number: '3',
      structure_type: 'בניין מגורים',
      local_authority_name: 'עיריית ירושלים',
      site_type: null,
      site_description: 'כניסה מהחניון התחתון',
      neighborhood_name: null,
      area_description: null,
      coordinates: { latitude: 31.79, longitude: 35.22, system: 'wgs84' },
    },
    {
      id: SITE_A2,
      client_id: CLIENT_A,
      label: 'מחסן — לקוח א׳',
      place_kind: 'open_area',
      city: 'ירושלים',
      street: 'רחוב הדוגמה',
      house_number: '14',
      apartment_number: null,
      structure_type: null,
      local_authority_name: 'עיריית ירושלים',
      site_type: 'מחסן',
      site_description: null,
      neighborhood_name: null,
      area_description: null,
      coordinates: null,
    },
    {
      id: SITE_B,
      client_id: CLIENT_B,
      label: 'אתר — לקוח ב׳',
      place_kind: 'dwelling',
      city: 'בית שמש',
      street: 'רחוב שני',
      house_number: '4',
      apartment_number: '2',
      structure_type: 'בניין מגורים',
      local_authority_name: null,
      site_type: null,
      site_description: null,
      neighborhood_name: null,
      area_description: null,
      coordinates: { latitude: 31.74, longitude: 35.19, system: 'wgs84' },
    },
  ];

  /** מסנן שורות לפי פרמטרים בסגנון PostgREST (eq / in / lte / gte / is). */
  function filterRows(rows: Row[], params: URLSearchParams): Row[] {
    let result = rows;
    for (const [key, raw] of params.entries()) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const [operator, ...rest] = raw.split('.');
      const value = rest.join('.');
      result = result.filter((row) => {
        const current = row[key];
        switch (operator) {
          case 'eq':
            return String(current ?? '') === value;
          case 'neq':
            return String(current ?? '') !== value;
          case 'lte':
            return String(current ?? '') <= value;
          case 'gte':
            return String(current ?? '') >= value;
          case 'in':
            return value
              .replace(/^\(|\)$/g, '')
              .split(',')
              .map((item) => item.replace(/^"|"$/g, ''))
              .includes(String(current ?? ''));
          case 'is':
            return value === 'null' ? current === null || current === undefined : Boolean(current);
          default:
            return true;
        }
      });
    }
    return result;
  }

  function orderRows(rows: Row[], params: URLSearchParams): Row[] {
    const order = params.get('order');
    if (!order) return rows;
    const [column, direction] = order.split('.');
    return [...rows].sort((a, b) => {
      const left = String(a[column ?? ''] ?? '');
      const right = String(b[column ?? ''] ?? '');
      const compare = left < right ? -1 : left > right ? 1 : 0;
      return direction === 'desc' ? -compare : compare;
    });
  }

  function upsertInto(store: Map<string, Row>, body: unknown): Row[] {
    const rows = Array.isArray(body) ? (body as Row[]) : [body as Row];
    const saved: Row[] = [];
    for (const row of rows) {
      const id = String(row.id ?? '');
      const merged = { ...(store.get(id) ?? {}), ...row, updated_at: new Date().toISOString() };
      store.set(id, merged);
      saved.push(merged);
    }
    return saved;
  }

  await page.route('**mock-project.supabase.co/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
        },
      });
      return;
    }

    if (!state.online) {
      await route.abort('internetdisconnected');
      return;
    }

    if (path.startsWith('/auth/v1/user')) return json(route, SESSION.user);
    if (path.startsWith('/auth/v1/token')) return json(route, SESSION);
    if (path.startsWith('/auth/v1/logout')) return json(route, {});
    // שליחת קוד/קישור התחברות.
    if (path.startsWith('/auth/v1/otp')) return json(route, {});
    // אימות הקוד — מחזיר session אמיתי, ו-supabase-js שומר אותו בעצמו.
    if (path.startsWith('/auth/v1/verify')) return json(route, SESSION);

    // זמן שרת — כותרת Date בתגובת HEAD.
    if (path === '/rest/v1/' || path === '/rest/v1') {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', date: new Date().toUTCString() },
      });
      return;
    }

    if (path.startsWith('/rest/v1/rpc/upsert_pest_log_draft')) {
      const body = JSON.parse(request.postData() ?? '{}') as {
        p_log_id: string;
        p_content: unknown;
        p_idempotency_key: string;
      };
      state.upsertCalls.push(body.p_idempotency_key);
      const existing = state.logs.get(body.p_log_id);
      const version = (existing?.version ?? 0) + 1;
      state.logs.set(body.p_log_id, { content: body.p_content, version, status: 'draft', serialNumber: null });
      return json(route, [{ id: body.p_log_id, version, status: 'draft' }]);
    }

    if (path.startsWith('/rest/v1/rpc/cancel_pest_log')) return json(route, [{ status: 'cancelled' }]);

    if (path.startsWith('/rest/v1/profiles')) {
      const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object+json');
      const profileRow = {
        id: '00000000-0000-4000-a000-00000000000a',
        organization_id: ORG_ID,
        user_id: USER_ID,
        full_name: 'מדביר דוגמה א׳',
        email: 'exterminator-a@example.test',
        phone: '0500000001',
        role: 'exterminator',
      };
      // רשימת חברי הארגון (לשיוך מסלולים) מוחזרת כמערך; טעינת הפרופיל
      // עצמה משתמשת ב-maybeSingle ומצפה לאובייקט.
      if (!single) return json(route, [profileRow]);
      return json(route, {
        id: '00000000-0000-4000-a000-00000000000a',
        organization_id: ORG_ID,
        user_id: USER_ID,
        full_name: 'מדביר דוגמה א׳',
        email: 'exterminator-a@example.test',
        phone: '0500000001',
        role: 'exterminator',
        organizations: { name: 'יצחק אחזקות והדברות', poison_center_phone: '04-7771900' },
      });
    }

    if (path.startsWith('/rest/v1/clients')) {
      return json(route, [
        {
          id: '00000000-0000-4000-c000-000000000002',
          name: 'לקוח פרטי לדוגמה',
          is_private_person: true,
          phone: '0500000011',
          mobile: '0500000011',
          email: 'private@example.test',
          contact_role: 'בעל הדירה',
          address: 'רחוב הדוגמה 12/3',
        },
        {
          id: '00000000-0000-4000-c000-000000000003',
          name: 'לקוח עסקי לדוגמה',
          is_private_person: false,
          phone: '0800000022',
          mobile: '0500000022',
          email: 'business@example.test',
          contact_role: 'אחראי תחזוקה',
          address: 'רחוב שני 4, בית שמש',
        },
      ]);
    }

    if (path.startsWith('/rest/v1/products')) {
      return json(route, [
        {
          id: '00000000-0000-4000-e000-000000000001',
          trade_name: 'תכשיר דוגמה ריכוז',
          active_ingredient_name: 'חומר פעיל לדוגמה A',
          active_ingredient_concentration_percent: 10,
          ready_to_use: false,
          registration_status: 'registered',
          registration_number: 'REG-DEMO-1',
          label_url: null,
          valid_until: '2029-01-01',
          approved_pests: ['מזיק דוגמה 1'],
          approved_application_methods: ['ריסוס נקודתי'],
          source_name: 'נתוני דוגמה לבדיקה',
          source_url: null,
          verified_at: new Date().toISOString(),
          is_active: true,
        },
      ]);
    }

    if (path.startsWith('/rest/v1/pest_catalog')) {
      return json(route, [
        {
          id: '00000000-0000-4000-1000-000000000001',
          code: 'DEMO-01',
          name_he: 'מזיק דוגמה 1',
          name_scientific: null,
          group_name: 'קבוצת דוגמה',
          source_name: 'נתוני דוגמה לבדיקה',
          verified_at: new Date().toISOString(),
        },
      ]);
    }

    if (path.startsWith('/rest/v1/client_sites')) {
      return json(route, filterRows(SITES, new URL(request.url()).searchParams));
    }

    // ── מסלול עבודה ──
    if (path.startsWith('/rest/v1/rpc/reorder_route_visits')) {
      const body = JSON.parse(request.postData() ?? '{}') as { p_route_id: string; p_visit_ids: string[] };
      state.reorderCalls.push(body.p_visit_ids);
      body.p_visit_ids.forEach((visitId, index) => {
        const visit = state.visits.get(visitId);
        if (visit) state.visits.set(visitId, { ...visit, position: index + 1 });
      });
      return json(route, body.p_visit_ids.length);
    }

    if (path.startsWith('/rest/v1/rpc/generate_route_from_template')) {
      const body = JSON.parse(request.postData() ?? '{}') as {
        p_template_id: string;
        p_route_date: string;
        p_assigned_user: string | null;
      };
      const template = state.templates.get(body.p_template_id);
      const newRouteId = `00000000-0000-4000-f000-${String(state.routes.size + 900).padStart(12, '0')}`;
      let created = 0;
      let skipped = 0;
      state.routes.set(newRouteId, {
        ...(template ?? {}),
        id: newRouteId,
        template_id: body.p_template_id,
        name: `${String(template?.name ?? 'מסלול')} — ${body.p_route_date}`,
        route_date: body.p_route_date,
        status: 'planned',
        order_locked: false,
        started_at: null,
        completed_at: null,
        assigned_user_id: body.p_assigned_user ?? template?.default_assignee_id ?? null,
        updated_at: new Date().toISOString(),
      });
      for (const stop of (template?.stops as Array<Record<string, string>> | undefined) ?? []) {
        const duplicate = [...state.visits.values()].some(
          (visit) =>
            visit.client_id === stop.clientId &&
            visit.planned_date === body.p_route_date &&
            visit.status !== 'cancelled',
        );
        if (duplicate) {
          skipped += 1;
          continue;
        }
        created += 1;
        const visitId = `${newRouteId.slice(0, -2)}${String(created).padStart(2, '0')}`;
        state.visits.set(visitId, {
          id: visitId,
          organization_id: ORG_ID,
          route_id: newRouteId,
          client_id: stop.clientId,
          client_site_id: stop.clientSiteId ?? null,
          position: created,
          planned_date: body.p_route_date,
          planned_start_time: null,
          time_window_start: null,
          time_window_end: null,
          estimated_duration_minutes: null,
          service_type: stop.serviceType ?? null,
          frequency_days: stop.frequencyDays ?? null,
          priority: 'normal',
          status: 'pending',
          assigned_user_id: body.p_assigned_user ?? null,
          assigned_vehicle_id: null,
          arrival_at: null,
          started_at: null,
          completed_at: null,
          latitude: null,
          longitude: null,
          linked_pest_log_id: null,
          completion_notes: null,
          follow_up_required: false,
          postponed_to_date: null,
          postpone_reason: null,
          internal_notes: null,
          updated_at: new Date().toISOString(),
        });
      }
      return json(route, [{ route_id: newRouteId, created_stops: created, skipped_stops: skipped }]);
    }

    const TABLE_STORES: Record<string, Map<string, Row>> = {
      text_templates: state.textTemplates,
      site_stations: state.siteStations,
      maintenance_routes: state.routes,
      route_visits: state.visits,
      visit_focus_items: state.focus,
      route_templates: state.templates,
    };

    const tableMatch =
      /^\/rest\/v1\/(maintenance_routes|route_visits|visit_focus_items|route_templates|text_templates|site_stations)/.exec(
        path,
      );
    if (tableMatch) {
      const store = TABLE_STORES[tableMatch[1] as string] as Map<string, Row>;
      const url = new URL(request.url());
      if (request.method() === 'GET') {
        const rows = orderRows(filterRows([...store.values()], url.searchParams), url.searchParams);
        if ((request.headers()['accept'] ?? '').includes('vnd.pgrst.object+json')) {
          const first = rows[0];
          if (!first) {
            return json(route, { code: 'PGRST116', message: 'no rows' }, 406);
          }
          return json(route, first);
        }
        return json(route, rows);
      }
      if (request.method() === 'POST' || request.method() === 'PATCH') {
        const saved = upsertInto(store, JSON.parse(request.postData() ?? '{}'));
        return json(route, saved);
      }
      if (request.method() === 'DELETE') {
        for (const row of filterRows([...store.values()], url.searchParams)) {
          store.delete(String(row.id));
        }
        return json(route, []);
      }
    }

    if (path.startsWith('/rest/v1/visit_status_history')) return json(route, []);
    if (path.startsWith('/rest/v1/bait_stations')) return json(route, []);

    if (path.startsWith('/rest/v1/attachments') && request.method() === 'POST') {
      return json(route, { id: '00000000-0000-4000-b000-000000000001' });
    }

    if (path.startsWith('/rest/v1/pest_logs')) {
      const rows = Array.from(state.logs.entries()).map(([id, log]) => ({
        id,
        serial_number: log.serialNumber,
        status: log.status,
        document_version: 1,
        document_hash: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        corrects_log_id: null,
        correction_reason: null,
        root_log_id: null,
        content: log.content,
        snapshot: log.snapshot ?? null,
        version: log.version,
      }));
      return json(route, rows);
    }

    return json(route, []);
  });

  // שירות ההשלמה וה-PDF.
  await page.route('**localhost:8787/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
        },
      });
      return;
    }
    if (!state.online) {
      await route.abort('internetdisconnected');
      return;
    }

    const url = new URL(request.url());
    if (url.pathname.endsWith('/complete')) {
      const key = request.headers()['idempotency-key'] ?? '';
      state.completeCalls.push(key);
      const serial = state.nextSerial;
      state.nextSerial += 1;
      const logId = url.pathname.split('/')[3] ?? '';
      const existing = state.logs.get(logId);
      if (existing) {
        existing.status = 'completed';
        existing.serialNumber = serial;
        // הצילום של התוכן — כך גם "יומן קודם" וגם סיכום ה-SMS עובדים בבדיקות.
        existing.snapshot = existing.content;
      }
      return json(route, {
        ok: true,
        logId,
        serialNumber: serial,
        documentHash: 'a'.repeat(64),
        documentVersion: 1,
        completedAt: new Date().toISOString(),
        pdfPath: 'org/logs/x/pdf/y.pdf',
        signedUrl: 'https://mock-project.supabase.co/storage/signed/y.pdf',
      });
    }
    return json(route, { ok: true });
  });

  return state;
}
