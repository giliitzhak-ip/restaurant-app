import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminClient, SEED, userClient } from '../setup/pgClient';

/**
 * RLS של מסלול העבודה.
 *
 * שתי שאלות נבדקות כאן: ארגון אחד אינו רואה מסלולים של ארגון אחר, ועובד
 * רואה ומעדכן רק את המסלולים שהוקצו לו. הבדיקות רצות בתפקיד
 * `authenticated`, בדיוק כמו PostgREST.
 */

const PROFILE_A_WORKER = '00000000-0000-4000-a000-00000000000a';

const PROFILE_A_WORKER2 = '00000000-0000-4000-a000-00000000000d';
const USER_A_WORKER2 = '00000000-0000-4000-9000-00000000000d';
const CLIENT_VAAD = '00000000-0000-4000-c000-000000000001';
const SITE_VAAD = '00000000-0000-4000-d000-000000000001';

let admin: pg.Client;
let manager: pg.Client;
let worker: pg.Client;
let otherWorker: pg.Client;
let orgBUser: pg.Client;

let assignedRoute: string;
let unassignedRoute: string;
let orgBRoute: string;
let assignedVisit: string;

beforeAll(async () => {
  admin = await adminClient();
  await admin.query(
    `insert into public.profiles (id, organization_id, user_id, full_name, role)
     values ($1, $2, $3, 'מדביר דוגמה ב׳ בארגון א׳', 'exterminator')
     on conflict (id) do nothing`,
    [PROFILE_A_WORKER2, SEED.orgA, USER_A_WORKER2],
  );

  manager = await userClient(SEED.userAManager);
  worker = await userClient(SEED.userAExterminator);
  otherWorker = await userClient(USER_A_WORKER2);
  orgBUser = await userClient(SEED.userBOwner);
});

afterAll(async () => {
  await Promise.allSettled([admin?.end(), manager?.end(), worker?.end(), otherWorker?.end(), orgBUser?.end()]);
});

beforeEach(async () => {
  await admin.query(`truncate
    public.visit_status_history, public.visit_focus_items, public.route_visits,
    public.route_assignments, public.maintenance_routes, public.route_templates cascade`);

  const assigned = await admin.query(
    `insert into public.maintenance_routes (organization_id, name, route_date, assigned_user_id)
     values ($1, 'מסלול של המדביר', '2026-09-20', $2) returning id`,
    [SEED.orgA, PROFILE_A_WORKER],
  );
  assignedRoute = assigned.rows[0].id as string;

  const unassigned = await admin.query(
    `insert into public.maintenance_routes (organization_id, name, route_date, assigned_user_id)
     values ($1, 'מסלול של עובד אחר', '2026-09-20', $2) returning id`,
    [SEED.orgA, PROFILE_A_WORKER2],
  );
  unassignedRoute = unassigned.rows[0].id as string;

  const orgB = await admin.query(
    `insert into public.maintenance_routes (organization_id, name, route_date)
     values ($1, 'מסלול של ארגון ב׳', '2026-09-20') returning id`,
    [SEED.orgB],
  );
  orgBRoute = orgB.rows[0].id as string;

  const visit = await admin.query(
    `insert into public.route_visits (organization_id, route_id, client_id, client_site_id, position, planned_date)
     values ($1, $2, $3, $4, 1, '2026-09-20') returning id`,
    [SEED.orgA, assignedRoute, CLIENT_VAAD, SITE_VAAD],
  );
  assignedVisit = visit.rows[0].id as string;

  await admin.query(
    `insert into public.route_visits (organization_id, route_id, client_id, client_site_id, position, planned_date)
     values ($1, $2, $3, null, 1, '2026-09-20')`,
    [SEED.orgA, unassignedRoute, CLIENT_VAAD],
  );
});

describe('בידוד בין ארגונים', () => {
  it('משתמש מארגון ב׳ אינו רואה מסלולים של ארגון א׳', async () => {
    const seen = await orgBUser.query('select id from public.maintenance_routes');
    expect(seen.rows.map((row) => row.id)).toEqual([orgBRoute]);
  });

  it('משתמש מארגון ב׳ אינו רואה תחנות של ארגון א׳', async () => {
    const seen = await orgBUser.query('select id from public.route_visits');
    expect(seen.rowCount).toBe(0);
  });

  it('עדכון מסלול של ארגון אחר אינו משנה דבר', async () => {
    const result = await orgBUser.query(
      `update public.maintenance_routes set name = 'נחטף' where id = $1`,
      [assignedRoute],
    );
    expect(result.rowCount).toBe(0);
    const after = await admin.query('select name from public.maintenance_routes where id = $1', [assignedRoute]);
    expect(after.rows[0].name).toBe('מסלול של המדביר');
  });

  it('משתמש מארגון ב׳ אינו יכול להוסיף תחנה למסלול של ארגון א׳', async () => {
    await expect(
      orgBUser.query(
        `insert into public.route_visits (organization_id, route_id, client_id, position, planned_date)
         values ($1, $2, $3, 9, '2026-09-20')`,
        [SEED.orgB, assignedRoute, CLIENT_VAAD],
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/);
  });
});

describe('הרשאות עובד מול מנהל', () => {
  it('עובד רואה רק את המסלולים שהוקצו לו', async () => {
    const seen = await worker.query('select id from public.maintenance_routes');
    expect(seen.rows.map((row) => row.id)).toEqual([assignedRoute]);
  });

  it('מנהל רואה את כל מסלולי הארגון', async () => {
    const seen = await manager.query('select id from public.maintenance_routes order by name');
    expect(seen.rows.map((row) => row.id).sort()).toEqual([assignedRoute, unassignedRoute].sort());
  });

  it('שיוך דרך route_assignments פותח גישה גם בלי assigned_user_id', async () => {
    const before = await otherWorker.query('select id from public.maintenance_routes where id = $1', [assignedRoute]);
    expect(before.rowCount).toBe(0);

    await admin.query(
      `insert into public.route_assignments (organization_id, route_id, profile_id) values ($1, $2, $3)`,
      [SEED.orgA, assignedRoute, PROFILE_A_WORKER2],
    );

    const after = await otherWorker.query('select id from public.maintenance_routes where id = $1', [assignedRoute]);
    expect(after.rowCount).toBe(1);
  });

  it('עובד רואה רק את תחנות המסלול שלו', async () => {
    const seen = await worker.query('select id, route_id from public.route_visits');
    expect(seen.rowCount).toBe(1);
    expect(seen.rows[0].route_id).toBe(assignedRoute);
  });

  it('עובד מעדכן סטטוס במסלול שלו, ולא במסלול של אחר', async () => {
    const mine = await worker.query(
      `update public.route_visits set status = 'in_progress' where id = $1`,
      [assignedVisit],
    );
    expect(mine.rowCount).toBe(1);

    const theirs = await worker.query(`update public.route_visits set status = 'completed' where route_id = $1`, [
      unassignedRoute,
    ]);
    expect(theirs.rowCount).toBe(0);
  });

  it('עובד אינו יכול ליצור מסלול — זו פעולה של מנהל', async () => {
    await expect(
      worker.query(
        `insert into public.maintenance_routes (organization_id, name, route_date) values ($1, 'מסלול פיראטי', '2026-09-21')`,
        [SEED.orgA],
      ),
    ).rejects.toThrow(/row-level security/);

    const allowed = await manager.query(
      `insert into public.maintenance_routes (organization_id, name, route_date, assigned_user_id)
       values ($1, 'מסלול חדש', '2026-09-21', $2) returning id`,
      [SEED.orgA, PROFILE_A_WORKER],
    );
    expect(allowed.rowCount).toBe(1);
  });

  it('עובד אינו יכול לשייך עובדים למסלול', async () => {
    await expect(
      worker.query(`insert into public.route_assignments (organization_id, route_id, profile_id) values ($1, $2, $3)`, [
        SEED.orgA,
        assignedRoute,
        PROFILE_A_WORKER2,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it('עובד אינו מוחק ביקורים — גם לא במסלול שלו', async () => {
    const result = await worker.query('delete from public.route_visits where id = $1', [assignedVisit]);
    expect(result.rowCount).toBe(0);

    const managerDelete = await manager.query('delete from public.route_visits where id = $1', [assignedVisit]);
    expect(managerDelete.rowCount).toBe(1);
  });

  it('עובד אינו מוחק היסטוריית ביקורים', async () => {
    await worker.query(`update public.route_visits set status = 'en_route' where id = $1`, [assignedVisit]);
    const history = await worker.query('select id from public.visit_status_history where visit_id = $1', [assignedVisit]);
    expect(history.rowCount).toBeGreaterThan(0);

    // אין מדיניות DELETE על היסטוריית הביקורים, ולכן המחיקה פשוט אינה
    // מוצאת שורות — ההיסטוריה נשארת שלמה.
    const deleted = await worker.query('delete from public.visit_status_history where visit_id = $1', [assignedVisit]);
    expect(deleted.rowCount).toBe(0);

    const stillThere = await admin.query('select id from public.visit_status_history where visit_id = $1', [
      assignedVisit,
    ]);
    expect(stillThere.rowCount).toBeGreaterThan(0);
  });

  it('עובד אינו יכול לשנות את הארגון של תחנה', async () => {
    await expect(
      worker.query('update public.route_visits set organization_id = $1 where id = $2', [SEED.orgB, assignedVisit]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('דגשים לביקור', () => {
  it('נראים רק למי שיש לו גישה למסלול', async () => {
    await admin.query(
      `insert into public.visit_focus_items (organization_id, visit_id, title, is_internal)
       values ($1, $2, 'בדיקת מוקד', true)`,
      [SEED.orgA, assignedVisit],
    );

    const mine = await worker.query('select id from public.visit_focus_items');
    expect(mine.rowCount).toBe(1);

    const others = await otherWorker.query('select id from public.visit_focus_items');
    expect(others.rowCount).toBe(0);

    const orgB = await orgBUser.query('select id from public.visit_focus_items');
    expect(orgB.rowCount).toBe(0);
  });

  it('עובד יכול להוסיף ולעדכן דגש בביקור שלו', async () => {
    const inserted = await worker.query(
      `insert into public.visit_focus_items (organization_id, visit_id, title) values ($1, $2, 'דגש של המדביר') returning id`,
      [SEED.orgA, assignedVisit],
    );
    expect(inserted.rowCount).toBe(1);

    const updated = await worker.query(`update public.visit_focus_items set status = 'done' where id = $1`, [
      inserted.rows[0].id,
    ]);
    expect(updated.rowCount).toBe(1);
  });
});

describe('קווי אחזקה', () => {
  it('עובד רואה תבניות אך אינו יוצר או מוחק אותן', async () => {
    const template = await admin.query(
      `insert into public.route_templates (organization_id, name) values ($1, 'קו ירושלים') returning id`,
      [SEED.orgA],
    );
    const templateId = template.rows[0].id as string;

    const seen = await worker.query('select id from public.route_templates');
    expect(seen.rowCount).toBe(1);

    await expect(
      worker.query(`insert into public.route_templates (organization_id, name) values ($1, 'קו פיראטי')`, [SEED.orgA]),
    ).rejects.toThrow(/row-level security/);

    const deleted = await worker.query('delete from public.route_templates where id = $1', [templateId]);
    expect(deleted.rowCount).toBe(0);

    const orgB = await orgBUser.query('select id from public.route_templates');
    expect(orgB.rowCount).toBe(0);
  });
});
