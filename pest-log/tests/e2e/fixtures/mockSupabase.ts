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

export interface ServerState {
  logs: Map<string, { content: unknown; version: number; status: string; serialNumber: number | null }>;
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
  const state: ServerState = {
    logs: new Map(),
    upsertCalls: [],
    completeCalls: [],
    nextSerial: 1,
    online: true,
  };

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
        snapshot: null,
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
