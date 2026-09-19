-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — פונקציות: מספור עוקב, השלמה אטומית, ביטול, תיקון, מחיקה רכה.
-- הפונקציות הרגישות פתוחות ל-service_role בלבד: הלקוח לא יכול לעקוף את
-- הוולידציה (Zod) שמתבצעת בשרת לפני הקריאה.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── הקצאת מספר סידורי עוקב ובלתי חוזר ברמת העסק ──────────────────────────────
create or replace function app.allocate_serial(p_org_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_serial bigint;
begin
  -- נעילת שורת הארגון מסדרת השלמות מקבילות ומבטיחה מספר עוקב ללא כפילות.
  update public.organizations
     set next_log_serial = next_log_serial + 1
   where id = p_org_id
  returning next_log_serial - 1 into v_serial;

  if v_serial is null then
    raise exception 'ארגון לא נמצא: %', p_org_id using errcode = 'P0002';
  end if;

  return v_serial;
end;
$$;

-- ── פיצוץ ה-snapshot לשורות מנורמלות ─────────────────────────────────────────
create or replace function app.materialize_log_children(p_log_id uuid, p_org_id uuid, p_content jsonb)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_assistant_ids uuid[] := '{}';
  v_assistant_id uuid;
  v_item jsonb;
  v_index integer;
begin
  perform set_config('app.completion_context', 'on', true);

  delete from public.signatures where pest_log_id = p_log_id;
  delete from public.assistant_exterminators where pest_log_id = p_log_id;
  delete from public.pesticide_applications where pest_log_id = p_log_id;
  delete from public.prevention_actions where pest_log_id = p_log_id;
  delete from public.pest_findings where pest_log_id = p_log_id;
  delete from public.bait_stations where pest_log_id = p_log_id;

  -- דרישה 6: ממצאי ניטור
  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_content #> '{monitoring,findings}', '[]'::jsonb)) loop
    insert into public.pest_findings (
      organization_id, pest_log_id, position, pest_name, pest_catalog_code,
      identification_actions, development_stage, infestation_signs, finding_location,
      infestation_level, notes
    ) values (
      p_org_id, p_log_id, v_index,
      v_item ->> 'pestName', v_item ->> 'pestCatalogCode',
      v_item ->> 'identificationActions', v_item ->> 'developmentStage',
      v_item ->> 'infestationSigns', v_item ->> 'findingLocation',
      v_item ->> 'infestationLevel', v_item ->> 'notes'
    );
    v_index := v_index + 1;
  end loop;

  -- דרישה 7: פעולות מניעה
  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_content #> '{prevention,actions}', '[]'::jsonb)) loop
    insert into public.prevention_actions (
      organization_id, pest_log_id, position, description, status, notes
    ) values (
      p_org_id, p_log_id, v_index, v_item ->> 'description', v_item ->> 'status', v_item ->> 'notes'
    );
    v_index := v_index + 1;
  end loop;

  -- דרישה 12: תכשירים ויישומים
  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_content -> 'applications', '[]'::jsonb)) loop
    insert into public.pesticide_applications (
      organization_id, pest_log_id, position, application_key, target_pest_name,
      product_id, product_trade_name, batch_number, active_ingredient_name,
      active_ingredient_concentration_percent, dosage, dosage_unit, mixture_kind,
      mixture_quantity, mixture_unit, quantity_basis, basis_amount, basis_unit,
      ready_to_use, ready_to_use_concentration_percent, ready_to_use_concentration_derived,
      application_method, product_snapshot, notes
    ) values (
      p_org_id, p_log_id, v_index, v_item ->> 'key', v_item ->> 'targetPestName',
      nullif(v_item ->> 'productId', '')::uuid, v_item ->> 'productTradeName',
      v_item ->> 'batchNumber', v_item ->> 'activeIngredientName',
      (v_item ->> 'activeIngredientConcentrationPercent')::numeric,
      (v_item ->> 'dosage')::numeric, v_item ->> 'dosageUnit', v_item ->> 'mixtureKind',
      (v_item ->> 'mixtureQuantity')::numeric, v_item ->> 'mixtureUnit',
      v_item ->> 'quantityBasis', (v_item ->> 'basisAmount')::numeric, v_item ->> 'basisUnit',
      coalesce((v_item ->> 'readyToUse')::boolean, false),
      (v_item ->> 'readyToUseConcentrationPercent')::numeric,
      coalesce((v_item ->> 'readyToUseConcentrationDerived')::boolean, false),
      v_item ->> 'applicationMethod', v_item -> 'productSnapshot', v_item ->> 'notes'
    );
    v_index := v_index + 1;
  end loop;

  -- דרישה 9: מדבירים מסייעים + חתימותיהם (דרישה 15)
  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_content -> 'assistants', '[]'::jsonb)) loop
    insert into public.assistant_exterminators (
      organization_id, pest_log_id, position, full_name, license_type, license_number,
      phone, email, address, instructions_given, instructions_details,
      received_log_copy, received_log_copy_at
    ) values (
      p_org_id, p_log_id, v_index, v_item ->> 'fullName', v_item ->> 'licenseType',
      v_item ->> 'licenseNumber', v_item ->> 'phone', v_item ->> 'email', v_item ->> 'address',
      coalesce((v_item ->> 'instructionsGiven')::boolean, false), v_item ->> 'instructionsDetails',
      coalesce((v_item ->> 'receivedLogCopy')::boolean, false),
      nullif(v_item ->> 'receivedLogCopyAt', '')::timestamptz
    ) returning id into v_assistant_id;

    v_assistant_ids := v_assistant_ids || v_assistant_id;

    if (v_item #>> '{signature,storagePath}') is null then
      raise exception 'חתימת המדביר המסייע "%" לא נשמרה באחסון — לא ניתן להשלים את היומן.', v_item ->> 'fullName'
        using errcode = 'P0001';
    end if;

    insert into public.signatures (
      organization_id, pest_log_id, signer_role, assistant_id, signer_name,
      storage_path, sha256, signed_at, confirmed
    ) values (
      p_org_id, p_log_id, 'assistant', v_assistant_id,
      coalesce(v_item #>> '{signature,signerName}', v_item ->> 'fullName'),
      v_item #>> '{signature,storagePath}',
      v_item #>> '{signature,sha256}',
      (v_item #>> '{signature,signedAt}')::timestamptz,
      coalesce((v_item #>> '{signature,confirmed}')::boolean, false)
    );

    v_index := v_index + 1;
  end loop;

  -- תחנות האכלה
  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_content -> 'baitStations', '[]'::jsonb)) loop
    insert into public.bait_stations (
      organization_id, pest_log_id, position, station_number, location_description,
      status, consumption_level, product_trade_name, coordinates, notes
    ) values (
      p_org_id, p_log_id, v_index, v_item ->> 'stationNumber', v_item ->> 'locationDescription',
      v_item ->> 'status', nullif(v_item ->> 'consumptionLevel', ''), v_item ->> 'productTradeName',
      v_item -> 'coordinates', v_item ->> 'notes'
    );
    v_index := v_index + 1;
  end loop;

  -- דרישה 15: חתימת המדביר וחתימת מקבל היומן
  if (p_content #>> '{signatures,exterminator,storagePath}') is null then
    raise exception 'חתימת המדביר לא נשמרה באחסון — לא ניתן להשלים את היומן.' using errcode = 'P0001';
  end if;
  if (p_content #>> '{signatures,recipient,storagePath}') is null then
    raise exception 'חתימת מקבל היומן לא נשמרה באחסון — לא ניתן להשלים את היומן.' using errcode = 'P0001';
  end if;

  insert into public.signatures (
    organization_id, pest_log_id, signer_role, signer_name, storage_path, sha256, signed_at, confirmed
  ) values (
    p_org_id, p_log_id, 'exterminator',
    p_content #>> '{signatures,exterminator,signerName}',
    p_content #>> '{signatures,exterminator,storagePath}',
    p_content #>> '{signatures,exterminator,sha256}',
    (p_content #>> '{signatures,exterminator,signedAt}')::timestamptz,
    coalesce((p_content #>> '{signatures,exterminator,confirmed}')::boolean, false)
  ), (
    p_org_id, p_log_id, 'recipient',
    p_content #>> '{signatures,recipient,signerName}',
    p_content #>> '{signatures,recipient,storagePath}',
    p_content #>> '{signatures,recipient,sha256}',
    (p_content #>> '{signatures,recipient,signedAt}')::timestamptz,
    coalesce((p_content #>> '{signatures,recipient,confirmed}')::boolean, false)
  );

  perform set_config('app.completion_context', 'off', true);
end;
$$;

-- ── השלמת יומן: פעולה אטומית אחת ─────────────────────────────────────────────
-- p_content חייב להיות תוכן שעבר ולידציה מלאה (Zod) בשרת.
-- p_validator_version מתועד ב-audit כדי לדעת איזו גרסת סכימה אישרה את היומן.
create or replace function public.complete_pest_log(
  p_log_id uuid,
  p_content jsonb,
  p_idempotency_key text,
  p_actor uuid default null,
  p_validator_version text default 'unknown'
)
returns public.pest_logs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_log public.pest_logs;
  v_org_id uuid;
  v_serial bigint;
  v_snapshot jsonb;
  v_hash text;
  v_completed_at timestamptz;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'נדרש idempotency key תקין להשלמת יומן.' using errcode = 'P0001';
  end if;

  select * into v_log from public.pest_logs where id = p_log_id for update;

  if not found then
    raise exception 'יומן לא נמצא: %', p_log_id using errcode = 'P0002';
  end if;

  -- אידמפוטנטיות: אותה קריאה שוב מחזירה את אותה תוצאה, בלי מספר סידורי חדש.
  if v_log.status = 'completed' then
    if v_log.completion_idempotency_key = p_idempotency_key then
      return v_log;
    end if;
    raise exception 'היומן כבר הושלם (מספר סידורי %). תיקון מתבצע בגרסת תיקון מקושרת.', v_log.serial_number
      using errcode = 'P0001';
  end if;

  if v_log.status <> 'draft' then
    raise exception 'לא ניתן להשלים יומן בסטטוס %.', v_log.status using errcode = 'P0001';
  end if;

  if v_log.deleted_at is not null then
    raise exception 'לא ניתן להשלים יומן שנמחק.' using errcode = 'P0001';
  end if;

  v_org_id := v_log.organization_id;
  -- זמן שרת, לא שעון המכשיר.
  v_completed_at := now();
  v_serial := app.allocate_serial(v_org_id);

  -- ה-snapshot הוא המסמך הקובע: התוכן + המטא-נתונים המחייבים.
  v_snapshot := p_content || jsonb_build_object(
    'meta', jsonb_build_object(
      'logId', p_log_id,
      'organizationId', v_org_id,
      'serialNumber', v_serial,
      'documentVersion', v_log.document_version,
      'completedAt', to_char(v_completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', 'completed',
      'correctsLogId', v_log.corrects_log_id,
      'correctionReason', v_log.correction_reason,
      'poisonCenterPhone', (select poison_center_phone from public.organizations where id = v_org_id),
      'organizationName', (select name from public.organizations where id = v_org_id),
      'validatorVersion', p_validator_version
    )
  );

  v_hash := app.document_hash(v_snapshot);

  update public.pest_logs
     set status = 'completed',
         content = p_content,
         snapshot = v_snapshot,
         serial_number = v_serial,
         document_hash = v_hash,
         completed_at = v_completed_at,
         completion_idempotency_key = p_idempotency_key,
         root_log_id = coalesce(root_log_id, p_log_id),
         updated_by = coalesce(p_actor, updated_by)
   where id = p_log_id
  returning * into v_log;

  perform app.materialize_log_children(p_log_id, v_org_id, v_snapshot);

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_org_id, p_actor, 'pest_log.completed', 'pest_log', p_log_id,
    jsonb_build_object(
      'serialNumber', v_serial,
      'documentVersion', v_log.document_version,
      'documentHash', v_hash,
      'validatorVersion', p_validator_version,
      'applicationsCount', jsonb_array_length(coalesce(p_content -> 'applications', '[]'::jsonb)),
      'findingsCount', jsonb_array_length(coalesce(p_content #> '{monitoring,findings}', '[]'::jsonb))
    )
  );

  return v_log;
end;
$$;

-- ── ביטול טיוטה ──────────────────────────────────────────────────────────────
create or replace function public.cancel_pest_log(
  p_log_id uuid,
  p_reason text,
  p_actor uuid default null
)
returns public.pest_logs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_log public.pest_logs;
  -- auth.uid() קודם ל-p_actor: משתמש מחובר לא יכול להתחזות למשתמש אחר.
  v_actor uuid := coalesce(auth.uid(), p_actor);
  v_caller_org uuid := app.current_org_id();
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'ביטול יומן מחייב ציון סיבה.' using errcode = 'P0001';
  end if;

  select * into v_log from public.pest_logs where id = p_log_id for update;
  if not found then
    raise exception 'יומן לא נמצא: %', p_log_id using errcode = 'P0002';
  end if;
  -- הפונקציה היא SECURITY DEFINER ולכן עוקפת RLS: הגבלת הארגון נאכפת כאן.
  if v_caller_org is not null and v_log.organization_id <> v_caller_org then
    raise exception 'אין הרשאה ליומן זה.' using errcode = '42501';
  end if;
  if v_log.status <> 'draft' then
    raise exception 'ניתן לבטל רק יומן בסטטוס טיוטה. היומן נמצא בסטטוס %.', v_log.status
      using errcode = 'P0001';
  end if;

  update public.pest_logs
     set status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = btrim(p_reason),
         updated_by = coalesce(v_actor, updated_by)
   where id = p_log_id
  returning * into v_log;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_log.organization_id, v_actor, 'pest_log.cancelled', 'pest_log', p_log_id,
          jsonb_build_object('hasReason', true));

  return v_log;
end;
$$;

-- ── פתיחת גרסת תיקון ─────────────────────────────────────────────────────────
-- היומן המקורי נשמר כמו שהוא. נוצרת טיוטה חדשה, מקושרת, עם גרסת מסמך +1.
create or replace function public.open_pest_log_correction(
  p_source_log_id uuid,
  p_reason text,
  p_actor uuid default null,
  p_idempotency_key text default null
)
returns public.pest_logs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_source public.pest_logs;
  v_existing public.pest_logs;
  v_new public.pest_logs;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'תיקון יומן מחייב ציון סיבת התיקון.' using errcode = 'P0001';
  end if;

  select * into v_source from public.pest_logs where id = p_source_log_id;
  if not found then
    raise exception 'יומן מקור לא נמצא: %', p_source_log_id using errcode = 'P0002';
  end if;
  if v_source.status <> 'completed' then
    raise exception 'ניתן לפתוח גרסת תיקון רק ליומן שהושלם.' using errcode = 'P0001';
  end if;

  -- אידמפוטנטיות: אותה בקשה לא תיצור שתי גרסאות תיקון.
  if p_idempotency_key is not null then
    select * into v_existing
      from public.pest_logs
     where organization_id = v_source.organization_id
       and client_idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  insert into public.pest_logs (
    organization_id, status, content, document_version, corrects_log_id, correction_reason,
    root_log_id, client_id, client_site_id, client_idempotency_key, created_by, updated_by
  ) values (
    v_source.organization_id, 'draft',
    -- התוכן מועתק כבסיס לעריכה; החתימות, המספר הסידורי וה-hash אינם מועתקים.
    (coalesce(v_source.snapshot, v_source.content) - 'signatures' - 'meta'),
    v_source.document_version + 1, p_source_log_id, btrim(p_reason),
    coalesce(v_source.root_log_id, v_source.id), v_source.client_id, v_source.client_site_id,
    p_idempotency_key, p_actor, p_actor
  ) returning * into v_new;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_source.organization_id, p_actor, 'pest_log.correction_opened', 'pest_log', v_new.id,
    jsonb_build_object(
      'sourceLogId', p_source_log_id,
      'sourceSerialNumber', v_source.serial_number,
      'newDocumentVersion', v_new.document_version
    )
  );

  return v_new;
end;
$$;

-- ── מחיקה רכה לאחר תקופת השמירה ──────────────────────────────────────────────
-- יומן שהושלם לא יימחק לפני שעברו לפחות retention_years שנים מההשלמה,
-- וגם אז — רק בהרשאת מנהל, כמחיקה רכה, עם audit trail.
create or replace function public.soft_delete_pest_log(
  p_log_id uuid,
  p_reason text,
  p_actor uuid default null
)
returns public.pest_logs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_log public.pest_logs;
  v_retention_years integer;
  -- auth.uid() קודם ל-p_actor: אין התחזות למשתמש אחר.
  v_actor uuid := coalesce(auth.uid(), p_actor);
  v_actor_role text;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'מחיקת יומן מחייבת ציון סיבה.' using errcode = 'P0001';
  end if;

  select * into v_log from public.pest_logs where id = p_log_id for update;
  if not found then
    raise exception 'יומן לא נמצא: %', p_log_id using errcode = 'P0002';
  end if;
  if v_log.deleted_at is not null then
    return v_log;
  end if;

  select role into v_actor_role
    from public.profiles
   where user_id = v_actor and organization_id = v_log.organization_id and deleted_at is null;

  if v_actor_role is null or v_actor_role not in ('owner', 'manager') then
    raise exception 'מחיקת יומן מותרת למנהל בלבד.' using errcode = '42501';
  end if;

  select retention_years into v_retention_years
    from public.organizations where id = v_log.organization_id;

  if v_log.status = 'completed' then
    if v_log.completed_at > now() - make_interval(years => v_retention_years) then
      raise exception 'לא ניתן למחוק יומן שהושלם לפני שעברו % שנים לפחות (הושלם ב-%).',
        v_retention_years, to_char(v_log.completed_at, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;

  perform set_config('app.soft_delete_context', 'on', true);
  update public.pest_logs
     set deleted_at = now(), deleted_by = v_actor
   where id = p_log_id
  returning * into v_log;
  perform set_config('app.soft_delete_context', 'off', true);

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_log.organization_id, v_actor, 'pest_log.soft_deleted', 'pest_log', p_log_id,
    jsonb_build_object('serialNumber', v_log.serial_number, 'retentionYears', v_retention_years, 'hasReason', true)
  );

  return v_log;
end;
$$;

-- ── רישום פעולת סנכרון (idempotent) ──────────────────────────────────────────
create or replace function public.record_sync_operation(
  p_org_id uuid,
  p_idempotency_key text,
  p_operation_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_client_updated_at timestamptz default null
)
returns public.sync_operations
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.sync_operations;
  v_caller_org uuid := app.current_org_id();
  v_org_id uuid;
begin
  -- SECURITY DEFINER עוקף RLS: משתמש מחובר יכול לרשום פעולות לארגון שלו בלבד.
  if v_caller_org is not null then
    if p_org_id is distinct from v_caller_org then
      raise exception 'אין הרשאה לרשום פעולת סנכרון לארגון אחר.' using errcode = '42501';
    end if;
    v_org_id := v_caller_org;
  else
    v_org_id := p_org_id;
  end if;

  insert into public.sync_operations (
    organization_id, idempotency_key, operation_type, entity_type, entity_id, payload, client_updated_at
  ) values (
    v_org_id, p_idempotency_key, p_operation_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb), p_client_updated_at
  )
  on conflict (organization_id, idempotency_key) do update
    set attempts = public.sync_operations.attempts + 1
  returning * into v_row;

  return v_row;
end;
$$;

-- ── שמירת טיוטה עם נעילה אופטימיסטית ומפתח אידמפוטנטיות ──────────────────────
-- מחזיר את הטיוטה המעודכנת. התנגשות (version ישן) מוחזרת כשגיאה מזוהה
-- כדי שהלקוח יציג "שגיאת סנכרון" ויציע מיזוג, בלי ליצור כפילות.
create or replace function public.upsert_pest_log_draft(
  p_log_id uuid,
  p_org_id uuid,
  p_content jsonb,
  p_expected_version integer,
  p_idempotency_key text,
  p_client_updated_at timestamptz default null,
  p_actor uuid default null,
  p_client_id uuid default null,
  p_client_site_id uuid default null
)
returns public.pest_logs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_log public.pest_logs;
  v_caller_org uuid := app.current_org_id();
  v_actor uuid := coalesce(auth.uid(), p_actor);
  v_org_id uuid;
begin
  -- SECURITY DEFINER עוקף RLS. הארגון נקבע לפי הפרופיל של המשתמש המחובר,
  -- ולא לפי פרמטר מהלקוח — אחרת ניתן היה לכתוב ליומן של ארגון אחר.
  if v_caller_org is not null then
    if p_org_id is distinct from v_caller_org then
      raise exception 'אין הרשאה לכתוב יומן לארגון אחר.' using errcode = '42501';
    end if;
    v_org_id := v_caller_org;
  else
    v_org_id := p_org_id;
  end if;

  select * into v_log from public.pest_logs where id = p_log_id for update;

  if not found then
    insert into public.pest_logs (
      id, organization_id, status, content, client_idempotency_key,
      client_id, client_site_id, created_by, updated_by
    ) values (
      p_log_id, v_org_id, 'draft', coalesce(p_content, '{}'::jsonb), p_idempotency_key,
      p_client_id, p_client_site_id, v_actor, v_actor
    )
    on conflict (id) do nothing
    returning * into v_log;

    if v_log.id is null then
      select * into v_log from public.pest_logs where id = p_log_id for update;
    end if;

    return v_log;
  end if;

  if v_log.organization_id <> v_org_id then
    raise exception 'היומן שייך לארגון אחר.' using errcode = '42501';
  end if;

  if v_log.status <> 'draft' then
    raise exception 'לא ניתן לערוך יומן בסטטוס %.', v_log.status using errcode = 'P0001';
  end if;

  if p_expected_version is not null and v_log.version <> p_expected_version then
    raise exception 'התנגשות גרסאות: היומן עודכן ממקום אחר (גרסה במסד %, נשלחה %).',
      v_log.version, p_expected_version
      using errcode = 'P0004';
  end if;

  -- last-write-wins לפי זמן הלקוח, אך רק אם הוא חדש מהרשומה הקיימת.
  if p_client_updated_at is not null and p_client_updated_at < v_log.updated_at then
    return v_log;
  end if;

  update public.pest_logs
     set content = coalesce(p_content, content),
         client_id = coalesce(p_client_id, client_id),
         client_site_id = coalesce(p_client_site_id, client_site_id),
         updated_by = coalesce(v_actor, updated_by)
   where id = p_log_id
  returning * into v_log;

  return v_log;
end;
$$;

-- ── הרשאות: הפונקציות הרגישות ל-service_role בלבד ────────────────────────────
revoke all on function public.complete_pest_log(uuid, jsonb, text, uuid, text) from public, anon, authenticated;
revoke all on function public.open_pest_log_correction(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function app.allocate_serial(uuid) from public, anon, authenticated;
revoke all on function app.materialize_log_children(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.complete_pest_log(uuid, jsonb, text, uuid, text) to service_role;
grant execute on function public.open_pest_log_correction(uuid, text, uuid, text) to service_role;

-- פעולות שהלקוח כן מבצע ישירות, תחת RLS.
grant execute on function public.cancel_pest_log(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.soft_delete_pest_log(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.record_sync_operation(uuid, text, text, text, uuid, jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.upsert_pest_log_draft(uuid, uuid, jsonb, integer, text, timestamptz, uuid, uuid, uuid) to authenticated, service_role;
