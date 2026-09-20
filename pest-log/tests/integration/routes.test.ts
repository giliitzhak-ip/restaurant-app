import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminClient, SEED, userClient } from '../setup/pgClient';

/**
 * בדיקות מסלול העבודה מול Postgres אמיתי.
 *
 * כאן נבדקות הפעולות שלא ניתן לבדוק במוק: יצירת מסלול מתבנית עם מניעת
 * כפילויות, שינוי סדר אטומי, היסטוריית סטטוס שנכתבת מעצמה ואינה ניתנת
 * לשינוי, והאיסור למחוק ביקור שכבר התחיל.
 */

const PROFILE_A_EXTERMINATOR = '00000000-0000-4000-a000-00000000000a';

const CLIENT_VAAD = '00000000-0000-4000-c000-000000000001';
const CLIENT_PRIVATE = '00000000-0000-4000-c000-000000000002';
const CLIENT_MUNI = '00000000-0000-4000-c000-000000000003';
const SITE_VAAD = '00000000-0000-4000-d000-000000000001';
const SITE_PRIVATE = '00000000-0000-4000-d000-000000000002';
const SITE_MUNI_PARK = '00000000-0000-4000-d000-000000000003';
const SITE_MUNI_FOG = '00000000-0000-4000-d000-000000000004';

let admin: pg.Client;
let manager: pg.Client;
let worker: pg.Client;

beforeAll(async () => {
  admin = await adminClient();
  manager = await userClient(SEED.userAManager);
  worker = await userClient(SEED.userAExterminator);
});

afterAll(async () => {
  await Promise.allSettled([admin?.end(), manager?.end(), worker?.end()]);
});

beforeEach(async () => {
  await admin.query(`truncate
    public.visit_status_history, public.visit_focus_items, public.route_visits,
    public.route_assignments, public.maintenance_routes, public.route_templates,
    public.audit_events cascade`);
});

async function createRoute(client: pg.Client, overrides: Record<string, unknown> = {}): Promise<string> {
  const result = await client.query(
    `insert into public.maintenance_routes
       (organization_id, name, route_kind, route_date, start_time, assigned_user_id, vehicle, area_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      SEED.orgA,
      overrides.name ?? 'קו ירושלים — יום ראשון',
      overrides.routeKind ?? 'maintenance_line',
      overrides.routeDate ?? '2026-09-20',
      overrides.startTime ?? '08:00',
      overrides.assignedUserId ?? PROFILE_A_EXTERMINATOR,
      overrides.vehicle ?? 'רכב 1',
      overrides.areaName ?? 'ירושלים',
    ],
  );
  return result.rows[0].id as string;
}

async function addVisit(
  client: pg.Client,
  routeId: string,
  clientId: string,
  siteId: string | null,
  position: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const result = await client.query(
    `insert into public.route_visits
       (organization_id, route_id, client_id, client_site_id, position, planned_date, planned_start_time, priority, time_window_start, time_window_end)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      SEED.orgA,
      routeId,
      clientId,
      siteId,
      position,
      extra.plannedDate ?? '2026-09-20',
      extra.plannedStartTime ?? null,
      extra.priority ?? 'normal',
      extra.timeWindowStart ?? null,
      extra.timeWindowEnd ?? null,
    ],
  );
  return result.rows[0].id as string;
}

describe('יצירת מסלול ידני ותחנות', () => {
  it('מנהל יוצר מסלול ומוסיף תחנות לפי סדר', async () => {
    const routeId = await createRoute(manager);
    await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    await addVisit(manager, routeId, CLIENT_PRIVATE, SITE_PRIVATE, 2);

    const visits = await manager.query(
      'select id, position from public.route_visits where route_id = $1 order by position',
      [routeId],
    );
    expect(visits.rowCount).toBe(2);
    expect(visits.rows.map((row) => row.position)).toEqual([1, 2]);
  });

  it('לקוח עם כמה אתרים מקבל תחנה נפרדת לכל אתר', async () => {
    const routeId = await createRoute(manager);
    await addVisit(manager, routeId, CLIENT_MUNI, SITE_MUNI_PARK, 1);
    await addVisit(manager, routeId, CLIENT_MUNI, SITE_MUNI_FOG, 2);

    const visits = await manager.query('select client_site_id from public.route_visits where route_id = $1', [routeId]);
    expect(visits.rowCount).toBe(2);
  });

  it('אותו אתר פעמיים באותו מסלול ובאותו יום נדחה', async () => {
    const routeId = await createRoute(manager);
    await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    await expect(addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 2)).rejects.toThrow();
  });

  it('חלון זמן הפוך נדחה ברמת בסיס הנתונים', async () => {
    const routeId = await createRoute(manager);
    await expect(
      addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1, { timeWindowStart: '14:00', timeWindowEnd: '10:00' }),
    ).rejects.toThrow();
  });

  it('הסרת לקוח מהמסלול אינה מוחקת אותו ממאגר הלקוחות', async () => {
    const routeId = await createRoute(manager);
    const visitId = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    await manager.query('delete from public.route_visits where id = $1', [visitId]);

    const visits = await manager.query('select id from public.route_visits where id = $1', [visitId]);
    expect(visits.rowCount).toBe(0);
    const clients = await manager.query('select id from public.clients where id = $1', [CLIENT_VAAD]);
    expect(clients.rowCount).toBe(1);
  });

  it('אי אפשר למחוק ביקור שכבר התחיל — רק לבטל אותו', async () => {
    const routeId = await createRoute(manager);
    const visitId = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    await worker.query(`update public.route_visits set status = 'in_progress', started_at = now() where id = $1`, [visitId]);

    await expect(manager.query('delete from public.route_visits where id = $1', [visitId])).rejects.toThrow(
      /לא ניתן למחוק ביקור שכבר התחיל/,
    );

    await manager.query(`update public.route_visits set status = 'cancelled' where id = $1`, [visitId]);
    const after = await manager.query('select status from public.route_visits where id = $1', [visitId]);
    expect(after.rows[0].status).toBe('cancelled');
  });
});

describe('יצירת מסלול מתבנית', () => {
  async function createTemplate(stops: unknown): Promise<string> {
    const result = await manager.query(
      `insert into public.route_templates (organization_id, name, route_kind, weekday, default_assignee_id, stops)
       values ($1, 'קו ירושלים — יום ראשון', 'maintenance_line', 0, $2, $3::jsonb)
       returning id`,
      [SEED.orgA, PROFILE_A_EXTERMINATOR, JSON.stringify(stops)],
    );
    return result.rows[0].id as string;
  }

  it('יוצר מסלול עם כל התחנות, ודגשים קבועים ממתינים לאישור', async () => {
    const templateId = await createTemplate([
      { clientId: CLIENT_VAAD, clientSiteId: SITE_VAAD, position: 1, serviceType: 'אחזקה חודשית', frequencyDays: 30 },
      {
        clientId: CLIENT_PRIVATE,
        clientSiteId: SITE_PRIVATE,
        position: 2,
        standingFocus: [{ category: 'access', title: 'תיאום כניסה מראש' }],
      },
    ]);

    const result = await manager.query('select * from public.generate_route_from_template($1, $2::date, $3, null)', [
      templateId,
      '2026-09-27',
      PROFILE_A_EXTERMINATOR,
    ]);
    expect(Number(result.rows[0].created_stops)).toBe(2);
    expect(Number(result.rows[0].skipped_stops)).toBe(0);

    const routeId = result.rows[0].route_id as string;
    const visits = await manager.query(
      'select client_id, position, service_type, frequency_days from public.route_visits where route_id = $1 order by position',
      [routeId],
    );
    expect(visits.rows[0].service_type).toBe('אחזקה חודשית');
    expect(Number(visits.rows[0].frequency_days)).toBe(30);

    const focus = await manager.query(
      `select title, approved, source from public.visit_focus_items where organization_id = $1`,
      [SEED.orgA],
    );
    expect(focus.rowCount).toBe(1);
    expect(focus.rows[0].approved).toBe(false);
    expect(focus.rows[0].source).toBe('template');
  });

  it('אינו יוצר ביקור כפול לאותו לקוח באותו תאריך', async () => {
    const templateId = await createTemplate([
      { clientId: CLIENT_VAAD, clientSiteId: SITE_VAAD, position: 1 },
      { clientId: CLIENT_PRIVATE, clientSiteId: SITE_PRIVATE, position: 2 },
    ]);

    const first = await manager.query('select * from public.generate_route_from_template($1, $2::date, null, null)', [
      templateId,
      '2026-09-27',
    ]);
    expect(Number(first.rows[0].created_stops)).toBe(2);

    // הרצה חוזרת של אותה תבנית לאותו יום — הכול מדולג.
    const second = await manager.query('select * from public.generate_route_from_template($1, $2::date, null, null)', [
      templateId,
      '2026-09-27',
    ]);
    expect(Number(second.rows[0].created_stops)).toBe(0);
    expect(Number(second.rows[0].skipped_stops)).toBe(2);

    // ליום אחר — נוצר שוב.
    const third = await manager.query('select * from public.generate_route_from_template($1, $2::date, null, null)', [
      templateId,
      '2026-10-04',
    ]);
    expect(Number(third.rows[0].created_stops)).toBe(2);
  });
});

describe('שינוי סדר התחנות', () => {
  it('הופך את הסדר בפעולה אחת ורושם היסטוריה ו-audit', async () => {
    const routeId = await createRoute(manager);
    const first = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    const second = await addVisit(manager, routeId, CLIENT_PRIVATE, SITE_PRIVATE, 2);
    const third = await addVisit(manager, routeId, CLIENT_MUNI, SITE_MUNI_PARK, 3);

    await worker.query('select public.reorder_route_visits($1, $2::uuid[])', [routeId, [third, first, second]]);

    const visits = await worker.query(
      'select id, position from public.route_visits where route_id = $1 order by position',
      [routeId],
    );
    expect(visits.rows.map((row) => row.id)).toEqual([third, first, second]);

    const history = await worker.query(
      `select count(*)::int as count from public.visit_status_history where route_id = $1 and action = 'reorder'`,
      [routeId],
    );
    expect(history.rows[0].count).toBeGreaterThan(0);

    const audit = await admin.query(
      `select count(*)::int as count from public.audit_events where action = 'route.reordered' and entity_id = $1`,
      [routeId],
    );
    expect(audit.rows[0].count).toBe(1);
  });

  it('רשימה חלקית נדחית ואינה משאירה מצב ביניים', async () => {
    const routeId = await createRoute(manager);
    const first = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    await addVisit(manager, routeId, CLIENT_PRIVATE, SITE_PRIVATE, 2);

    await expect(
      manager.query('select public.reorder_route_visits($1, $2::uuid[])', [routeId, [first]]),
    ).rejects.toThrow(/כל 2 התחנות/);

    const visits = await manager.query('select position from public.route_visits where route_id = $1 order by position', [
      routeId,
    ]);
    expect(visits.rows.map((row) => row.position)).toEqual([1, 2]);
  });

  it('סדר נעול נחסם לעובד ומותר למנהל', async () => {
    const routeId = await createRoute(manager);
    const first = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    const second = await addVisit(manager, routeId, CLIENT_PRIVATE, SITE_PRIVATE, 2);
    await manager.query('update public.maintenance_routes set order_locked = true where id = $1', [routeId]);

    await expect(
      worker.query('select public.reorder_route_visits($1, $2::uuid[])', [routeId, [second, first]]),
    ).rejects.toThrow(/סדר המסלול נעול/);

    await manager.query('select public.reorder_route_visits($1, $2::uuid[])', [routeId, [second, first]]);
    const visits = await manager.query(
      'select id from public.route_visits where route_id = $1 order by position',
      [routeId],
    );
    expect(visits.rows.map((row) => row.id)).toEqual([second, first]);
  });
});

describe('היסטוריית ביקור', () => {
  it('נרשמת אוטומטית בכל שינוי סטטוס ואינה ניתנת לשינוי או מחיקה', async () => {
    const routeId = await createRoute(manager);
    const visitId = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);

    await worker.query(`update public.route_visits set status = 'en_route' where id = $1`, [visitId]);
    await worker.query(`update public.route_visits set status = 'in_progress', started_at = now() where id = $1`, [visitId]);
    await worker.query(
      `update public.route_visits set status = 'completed', completed_at = now(), follow_up_required = true where id = $1`,
      [visitId],
    );

    const history = await worker.query(
      `select from_status, to_status from public.visit_status_history
        where visit_id = $1 and action in ('added', 'status_change') order by changed_at`,
      [visitId],
    );
    expect(history.rows.map((row) => row.to_status)).toEqual(['pending', 'en_route', 'in_progress', 'completed']);

    await expect(
      admin.query(`update public.visit_status_history set to_status = 'cancelled' where visit_id = $1`, [visitId]),
    ).rejects.toThrow(/append-only/);
    await expect(admin.query('delete from public.visit_status_history where visit_id = $1', [visitId])).rejects.toThrow(
      /append-only/,
    );
  });

  it('דחיית ביקור נרשמת עם הסיבה', async () => {
    const routeId = await createRoute(manager);
    const visitId = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    await worker.query(
      `update public.route_visits set status = 'postponed', postponed_to_date = '2026-09-23', postpone_reason = 'הלקוח ביקש' where id = $1`,
      [visitId],
    );

    const history = await worker.query(
      `select action, reason from public.visit_status_history where visit_id = $1 and action = 'postponed'`,
      [visitId],
    );
    expect(history.rowCount).toBe(1);
    expect(history.rows[0].reason).toBe('הלקוח ביקש');
  });

  it('שינוי סטטוס משמעותי נרשם ב-audit בלי מידע אישי', async () => {
    const routeId = await createRoute(manager);
    const visitId = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    await worker.query(`update public.route_visits set status = 'completed', completed_at = now() where id = $1`, [visitId]);

    const audit = await admin.query(
      `select action, metadata from public.audit_events where entity_id = $1 and entity_type = 'route_visit'`,
      [visitId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].action).toBe('route_visit.completed');
    expect(JSON.stringify(audit.rows[0].metadata)).not.toContain('ועד בית');
  });
});

describe('קישור ליומן ההדברה', () => {
  it('ביקור מקושר ליומן, והיומן עצמו אינו מושפע ממחיקת הביקור', async () => {
    const routeId = await createRoute(manager);
    const visitId = await addVisit(manager, routeId, CLIENT_VAAD, SITE_VAAD, 1);
    const log = await admin.query(
      `insert into public.pest_logs (organization_id, content, client_id) values ($1, '{}'::jsonb, $2) returning id`,
      [SEED.orgA, CLIENT_VAAD],
    );
    const logId = log.rows[0].id as string;

    await worker.query('update public.route_visits set linked_pest_log_id = $1 where id = $2', [logId, visitId]);
    await manager.query('delete from public.route_visits where id = $1', [visitId]);

    const stillThere = await admin.query('select id from public.pest_logs where id = $1', [logId]);
    expect(stillThere.rowCount).toBe(1);
  });
});
