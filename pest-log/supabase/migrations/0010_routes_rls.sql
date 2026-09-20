-- ─────────────────────────────────────────────────────────────────────────────
-- 0010 — מסלול עבודה: טריגרים, פונקציות ו-RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── טריגרים גנריים ──────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'route_templates', 'maintenance_routes', 'route_assignments',
    'route_visits', 'visit_focus_items', 'visit_status_history'
  ];
  versioned text[] := array[
    'route_templates', 'maintenance_routes', 'route_assignments',
    'route_visits', 'visit_focus_items'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_touch before update on public.%1$I
       for each row execute function app.touch_row()', t);

    execute format('drop trigger if exists trg_%1$s_created_by on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_created_by before insert on public.%1$I
       for each row execute function app.stamp_created_by()', t);
  end loop;

  foreach t in array versioned loop
    execute format('drop trigger if exists trg_%1$s_version on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_version before update on public.%1$I
       for each row execute function app.bump_version()', t);
  end loop;
end $$;

-- ── מי המשתמש המחובר ────────────────────────────────────────────────────────
create or replace function app.current_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, app, auth
as $$
declare
  v_id uuid;
begin
  select p.id into v_id
  from public.profiles p
  where p.user_id = auth.uid() and p.deleted_at is null
  limit 1;
  return v_id;
end;
$$;

/**
 * האם המשתמש המחובר רשאי לגשת למסלול.
 * מנהל — לכל מסלולי הארגון. עובד — רק למסלולים שהוקצו לו, ישירות
 * (assigned_user_id) או דרך route_assignments.
 * SECURITY DEFINER כדי שלא תיווצר רקורסיה מול ה-RLS של המסלולים עצמם.
 */
create or replace function app.can_access_route(p_route_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app, auth
as $$
declare
  v_org uuid := app.current_org_id();
  v_profile uuid := app.current_profile_id();
  v_found boolean;
begin
  if p_route_id is null or v_org is null then
    return false;
  end if;

  select true into v_found
  from public.maintenance_routes r
  where r.id = p_route_id
    and r.organization_id = v_org
    and (
      app.is_org_admin()
      or r.assigned_user_id = v_profile
      or exists (
        select 1 from public.route_assignments a
        where a.route_id = r.id and a.profile_id = v_profile and a.deleted_at is null
      )
    )
  limit 1;

  return coalesce(v_found, false);
end;
$$;


/**
 * רישום audit מתוך פונקציות שרצות בהרשאות המשתמש.
 * audit_events הוא append-only וסגור לכתיבה ישירה מהלקוח, ולכן הכתיבה
 * עוברת דרך פונקציה מוגדרת אחת, שמוודאת שהאירוע שייך לארגון של המשתמש.
 */
create or replace function app.write_audit_event(
  p_org_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app, auth
as $$
begin
  if p_org_id is distinct from app.current_org_id() then
    raise exception 'אין הרשאה לרשום אירוע עבור ארגון אחר' using errcode = '42501';
  end if;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_org_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

grant execute on function app.write_audit_event(uuid, text, text, uuid, jsonb) to authenticated;

-- ── היסטוריית ביקורים: נכתבת אוטומטית, ולא ניתנת לשינוי ─────────────────────
create or replace function app.record_visit_history()
returns trigger
language plpgsql
security definer
set search_path = public, app, auth
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.visit_status_history
      (organization_id, route_id, visit_id, action, to_status, to_position, changed_by)
    values (new.organization_id, new.route_id, new.id, 'added', new.status, new.position, v_actor);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.visit_status_history
      (organization_id, route_id, visit_id, action, from_status, to_status,
       from_position, to_position, reason, changed_by)
    values (new.organization_id, new.route_id, new.id,
            case when new.status = 'postponed' then 'postponed' else 'status_change' end,
            old.status, new.status, old.position, new.position,
            case when new.status = 'postponed' then new.postpone_reason else null end,
            v_actor);
  end if;

  if new.position is distinct from old.position then
    insert into public.visit_status_history
      (organization_id, route_id, visit_id, action, from_position, to_position, changed_by, metadata)
    values (new.organization_id, new.route_id, new.id, 'reorder', old.position, new.position, v_actor,
            jsonb_build_object('routeStatus', (
              select r.status from public.maintenance_routes r where r.id = new.route_id
            )));
  end if;

  if new.priority is distinct from old.priority then
    insert into public.visit_status_history
      (organization_id, route_id, visit_id, action, changed_by, metadata)
    values (new.organization_id, new.route_id, new.id, 'priority_change', v_actor,
            jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;

  -- audit על הפעולות המשמעותיות בלבד, ובלי מידע אישי.
  if new.status is distinct from old.status and new.status in ('in_progress', 'completed', 'cancelled') then
    insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (new.organization_id, v_actor, 'route_visit.' || new.status, 'route_visit', new.id,
            jsonb_build_object('routeId', new.route_id, 'hasLinkedLog', new.linked_pest_log_id is not null));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_route_visits_history on public.route_visits;
create trigger trg_route_visits_history
  after insert or update on public.route_visits
  for each row execute function app.record_visit_history();

/**
 * היסטוריית הביקורים היא append-only.
 * החריג היחיד: מחיקת מסלול שלם על ידי מנהל, שבה השורות נמחקות
 * במפל (cascade) אחרי שהמסלול עצמו כבר נמחק. בכל מקרה אחר — המסלול
 * עדיין קיים, ולכן המחיקה נחסמת.
 */
create or replace function app.forbid_visit_history_mutation()
returns trigger
language plpgsql
as $$
begin
  -- מחיקת מסלול שלם: השורות נמחקות במפל אחרי שהמסלול כבר אינו קיים.
  if tg_op = 'DELETE'
     and not exists (select 1 from public.maintenance_routes r where r.id = old.route_id) then
    return old;
  end if;

  -- הסרת ביקור: ה-FK מאפס את visit_id בלבד, והשורה עצמה נשמרת.
  if tg_op = 'UPDATE'
     and new.visit_id is null
     and old.visit_id is not null
     and to_jsonb(new) - 'visit_id' = to_jsonb(old) - 'visit_id' then
    return new;
  end if;

  raise exception 'היסטוריית הביקורים היא append-only ואינה ניתנת לשינוי או למחיקה'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_visit_status_history_immutable on public.visit_status_history;
create trigger trg_visit_status_history_immutable
  before update or delete on public.visit_status_history
  for each row execute function app.forbid_visit_history_mutation();

/**
 * הסרת לקוח ממסלול מותרת רק כל עוד הביקור לא התחיל.
 * ביקור שהתחיל או הושלם הוא היסטוריה: אפשר לבטל אותו עם סיבה, אך לא
 * למחוק אותו. הלקוח עצמו נשאר במאגר הלקוחות בכל מקרה.
 */
create or replace function app.guard_route_visit_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status not in ('pending', 'postponed') or old.started_at is not null then
    raise exception 'לא ניתן למחוק ביקור שכבר התחיל. ניתן לבטל אותו עם סיבה.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_route_visits_guard_delete on public.route_visits;
create trigger trg_route_visits_guard_delete
  before delete on public.route_visits
  for each row execute function app.guard_route_visit_delete();

-- ── שינוי סדר התחנות ────────────────────────────────────────────────────────
/**
 * מעדכן את סדר כל התחנות במסלול בפעולה אחת.
 * הסדר חייב להיות התמורה המלאה של תחנות המסלול — אחרת הפעולה נדחית
 * ואין מצב ביניים. שינוי לאחר נעילת הסדר מותר למנהל בלבד, והוא נרשם
 * בהיסטוריה על ידי הטריגר.
 */
create or replace function public.reorder_route_visits(p_route_id uuid, p_visit_ids uuid[])
returns integer
language plpgsql
set search_path = public, app, auth
as $$
declare
  v_route public.maintenance_routes%rowtype;
  v_expected integer;
  v_given integer := coalesce(array_length(p_visit_ids, 1), 0);
  v_index integer;
begin
  select * into v_route from public.maintenance_routes where id = p_route_id;
  if not found then
    raise exception 'המסלול לא נמצא' using errcode = 'P0002';
  end if;

  if v_route.order_locked and not app.is_org_admin() then
    raise exception 'סדר המסלול נעול. פתיחה מחדש מחייבת הרשאת מנהל.' using errcode = '42501';
  end if;

  select count(*) into v_expected
  from public.route_visits v
  where v.route_id = p_route_id and v.deleted_at is null;

  if v_given <> v_expected then
    raise exception 'רשימת הסדר חייבת לכלול את כל % התחנות במסלול', v_expected
      using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_visit_ids) as t(id)
    where not exists (
      select 1 from public.route_visits v
      where v.id = t.id and v.route_id = p_route_id and v.deleted_at is null
    )
  ) then
    raise exception 'רשימת הסדר מכילה תחנה שאינה שייכת למסלול' using errcode = '22023';
  end if;

  -- אין אילוץ ייחודיות על (route_id, position), ולכן אפשר לכתוב את
  -- הסדר הסופי ישירות, בתוך אותה טרנזקציה — או הכול או כלום.
  for v_index in 1 .. v_given loop
    update public.route_visits
    set position = v_index
    where id = p_visit_ids[v_index];
  end loop;

  perform app.write_audit_event(
    v_route.organization_id, 'route.reordered', 'maintenance_route', p_route_id,
    jsonb_build_object('stops', v_given, 'routeStatus', v_route.status, 'wasLocked', v_route.order_locked)
  );

  return v_given;
end;
$$;

/**
 * יצירת מסלול מתבנית ליום מסוים.
 * ביקור נוצר רק ללקוח/אתר שאין לו כבר ביקור פעיל באותו תאריך — כדי
 * שהרצה חוזרת של אותה תבנית לא תייצר כפילויות.
 * מחזיר את מזהה המסלול ואת מספר התחנות שנוצרו ושדולגו.
 */
create or replace function public.generate_route_from_template(
  p_template_id uuid,
  p_route_date date,
  p_assigned_user uuid default null,
  p_route_id uuid default null
)
returns table (route_id uuid, created_stops integer, skipped_stops integer)
language plpgsql
set search_path = public, app, auth
as $$
declare
  v_template public.route_templates%rowtype;
  v_route_id uuid := coalesce(p_route_id, gen_random_uuid());
  v_stop jsonb;
  v_client uuid;
  v_site uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_position integer := 0;
begin
  select * into v_template from public.route_templates where id = p_template_id and deleted_at is null;
  if not found then
    raise exception 'התבנית לא נמצאה' using errcode = 'P0002';
  end if;

  insert into public.maintenance_routes (
    id, organization_id, template_id, name, route_kind, area_name, route_date, start_time,
    assigned_user_id, team_name, vehicle, start_point_address, start_point_coordinates, notes, status
  )
  values (
    v_route_id, v_template.organization_id, v_template.id,
    v_template.name || ' — ' || to_char(p_route_date, 'DD/MM/YYYY'),
    v_template.route_kind, v_template.area_name, p_route_date, v_template.default_start_time,
    coalesce(p_assigned_user, v_template.default_assignee_id), v_template.default_team_name,
    v_template.default_vehicle, v_template.start_point_address, v_template.start_point_coordinates,
    v_template.notes, 'planned'
  );

  for v_stop in select * from jsonb_array_elements(v_template.stops) loop
    v_client := nullif(v_stop ->> 'clientId', '')::uuid;
    v_site := nullif(v_stop ->> 'clientSiteId', '')::uuid;
    if v_client is null then
      continue;
    end if;

    -- כפילות: אותו לקוח ואותו אתר, באותו תאריך, בכל מסלול פעיל.
    if exists (
      select 1 from public.route_visits v
      where v.organization_id = v_template.organization_id
        and v.client_id = v_client
        and coalesce(v.client_site_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(v_site, '00000000-0000-0000-0000-000000000000'::uuid)
        and v.planned_date = p_route_date
        and v.status <> 'cancelled'
        and v.deleted_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_position := v_position + 1;
    insert into public.route_visits (
      organization_id, route_id, client_id, client_site_id, position, planned_date,
      planned_start_time, time_window_start, time_window_end, estimated_duration_minutes,
      service_type, frequency_days, priority, assigned_user_id, assigned_vehicle_id
    )
    values (
      v_template.organization_id, v_route_id, v_client, v_site, v_position, p_route_date,
      nullif(v_stop ->> 'plannedStartTime', '')::time,
      nullif(v_stop ->> 'timeWindowStart', '')::time,
      nullif(v_stop ->> 'timeWindowEnd', '')::time,
      nullif(v_stop ->> 'estimatedDurationMinutes', '')::integer,
      nullif(v_stop ->> 'serviceType', ''),
      nullif(v_stop ->> 'frequencyDays', '')::integer,
      coalesce(nullif(v_stop ->> 'priority', ''), 'normal'),
      coalesce(p_assigned_user, v_template.default_assignee_id),
      v_template.default_vehicle
    );
    v_created := v_created + 1;

    -- דגשים קבועים של התבנית נכנסים כהצעה הממתינה לאישור המדביר.
    insert into public.visit_focus_items (
      organization_id, visit_id, category, title, details, source, approved, position
    )
    select
      v_template.organization_id,
      (select v.id from public.route_visits v
        where v.route_id = v_route_id and v.position = v_position limit 1),
      coalesce(nullif(item ->> 'category', ''), 'note'),
      item ->> 'title',
      nullif(item ->> 'details', ''),
      'template',
      false,
      (ordinality)::integer
    from jsonb_array_elements(coalesce(v_stop -> 'standingFocus', '[]'::jsonb)) with ordinality as t(item, ordinality)
    where length(btrim(coalesce(item ->> 'title', ''))) > 0;
  end loop;

  perform app.write_audit_event(
    v_template.organization_id, 'route.generated_from_template', 'maintenance_route', v_route_id,
    jsonb_build_object('templateId', p_template_id, 'created', v_created, 'skipped', v_skipped)
  );

  return query select v_route_id, v_created, v_skipped;
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'route_templates', 'maintenance_routes', 'route_assignments',
    'route_visits', 'visit_focus_items', 'visit_status_history'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- route_templates — צפייה לכל חברי הארגון, ניהול למנהל בלבד.
drop policy if exists route_templates_select on public.route_templates;
create policy route_templates_select on public.route_templates
  for select to authenticated
  using (organization_id = app.current_org_id() and deleted_at is null);

drop policy if exists route_templates_write on public.route_templates;
create policy route_templates_write on public.route_templates
  for insert to authenticated
  with check (organization_id = app.current_org_id() and app.is_org_admin());

drop policy if exists route_templates_update on public.route_templates;
create policy route_templates_update on public.route_templates
  for update to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin())
  with check (organization_id = app.current_org_id());

drop policy if exists route_templates_delete on public.route_templates;
create policy route_templates_delete on public.route_templates
  for delete to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin());

-- maintenance_routes — עובד רואה ומעדכן רק את המסלולים שהוקצו לו.
-- התנאי נכתב על עמודות השורה עצמה ולא דרך app.can_access_route: פונקציה
-- stable שקוראת את הטבלה אינה רואה שורה שנוצרה באותה פקודה, ולכן
-- INSERT ... RETURNING היה נכשל.
drop policy if exists maintenance_routes_select on public.maintenance_routes;
create policy maintenance_routes_select on public.maintenance_routes
  for select to authenticated
  using (
    organization_id = app.current_org_id()
    and deleted_at is null
    and (
      app.is_org_admin()
      or assigned_user_id = app.current_profile_id()
      or exists (
        -- חובה להסמיך את העמודה החיצונית: בתוך תת-השאילתה `id` היה
        -- נקשר ל-route_assignments.id ולא למסלול עצמו.
        select 1 from public.route_assignments a
        where a.route_id = maintenance_routes.id
          and a.profile_id = app.current_profile_id()
          and a.deleted_at is null
      )
    )
  );

drop policy if exists maintenance_routes_insert on public.maintenance_routes;
create policy maintenance_routes_insert on public.maintenance_routes
  for insert to authenticated
  with check (organization_id = app.current_org_id() and app.is_org_admin());

drop policy if exists maintenance_routes_update on public.maintenance_routes;
create policy maintenance_routes_update on public.maintenance_routes
  for update to authenticated
  using (organization_id = app.current_org_id() and app.can_access_route(id))
  with check (
    organization_id = app.current_org_id()
    and (app.is_org_admin() or assigned_user_id = app.current_profile_id())
  );

drop policy if exists maintenance_routes_delete on public.maintenance_routes;
create policy maintenance_routes_delete on public.maintenance_routes
  for delete to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin());

-- route_assignments — שיוך עובדים: מנהל בלבד. עובד רואה את השיוך שלו.
drop policy if exists route_assignments_select on public.route_assignments;
create policy route_assignments_select on public.route_assignments
  for select to authenticated
  using (
    organization_id = app.current_org_id() and deleted_at is null
    and (app.is_org_admin() or profile_id = app.current_profile_id())
  );

drop policy if exists route_assignments_insert on public.route_assignments;
create policy route_assignments_insert on public.route_assignments
  for insert to authenticated
  with check (organization_id = app.current_org_id() and app.is_org_admin());

drop policy if exists route_assignments_update on public.route_assignments;
create policy route_assignments_update on public.route_assignments
  for update to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin())
  with check (organization_id = app.current_org_id());

drop policy if exists route_assignments_delete on public.route_assignments;
create policy route_assignments_delete on public.route_assignments
  for delete to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin());

-- route_visits — לפי הגישה למסלול. מחיקה למנהל בלבד (והטריגר מגן על היסטוריה).
drop policy if exists route_visits_select on public.route_visits;
create policy route_visits_select on public.route_visits
  for select to authenticated
  using (organization_id = app.current_org_id() and deleted_at is null and app.can_access_route(route_id));

drop policy if exists route_visits_insert on public.route_visits;
create policy route_visits_insert on public.route_visits
  for insert to authenticated
  with check (organization_id = app.current_org_id() and app.can_access_route(route_id));

drop policy if exists route_visits_update on public.route_visits;
create policy route_visits_update on public.route_visits
  for update to authenticated
  using (organization_id = app.current_org_id() and app.can_access_route(route_id))
  with check (organization_id = app.current_org_id());

drop policy if exists route_visits_delete on public.route_visits;
create policy route_visits_delete on public.route_visits
  for delete to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin());

-- visit_focus_items — לפי הגישה למסלול של הביקור.
drop policy if exists visit_focus_items_select on public.visit_focus_items;
create policy visit_focus_items_select on public.visit_focus_items
  for select to authenticated
  using (
    organization_id = app.current_org_id() and deleted_at is null
    and exists (
      select 1 from public.route_visits v
      where v.id = visit_id and app.can_access_route(v.route_id)
    )
  );

drop policy if exists visit_focus_items_insert on public.visit_focus_items;
create policy visit_focus_items_insert on public.visit_focus_items
  for insert to authenticated
  with check (
    organization_id = app.current_org_id()
    and exists (
      select 1 from public.route_visits v
      where v.id = visit_id and app.can_access_route(v.route_id)
    )
  );

drop policy if exists visit_focus_items_update on public.visit_focus_items;
create policy visit_focus_items_update on public.visit_focus_items
  for update to authenticated
  using (
    organization_id = app.current_org_id()
    and exists (
      select 1 from public.route_visits v
      where v.id = visit_id and app.can_access_route(v.route_id)
    )
  )
  with check (organization_id = app.current_org_id());

drop policy if exists visit_focus_items_delete on public.visit_focus_items;
create policy visit_focus_items_delete on public.visit_focus_items
  for delete to authenticated
  using (
    organization_id = app.current_org_id()
    and exists (
      select 1 from public.route_visits v
      where v.id = visit_id and v.status = 'pending' and app.can_access_route(v.route_id)
    )
  );

-- visit_status_history — קריאה בלבד. הכתיבה היא של הטריגר (SECURITY DEFINER).
drop policy if exists visit_status_history_select on public.visit_status_history;
create policy visit_status_history_select on public.visit_status_history
  for select to authenticated
  using (organization_id = app.current_org_id() and app.can_access_route(route_id));

-- ── הרשאות טבלה ─────────────────────────────────────────────────────────────
-- ה-RLS הוא שכבת האכיפה; ה-GRANT רק פותח את הדלת לתפקיד המחובר.
do $$
declare
  t text;
  tables text[] := array[
    'route_templates', 'maintenance_routes', 'route_assignments',
    'route_visits', 'visit_focus_items', 'visit_status_history'
  ];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant execute on function public.reorder_route_visits(uuid, uuid[]) to authenticated;
grant execute on function public.generate_route_from_template(uuid, date, uuid, uuid) to authenticated;
