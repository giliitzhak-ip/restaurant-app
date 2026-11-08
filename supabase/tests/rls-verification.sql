-- ============================================================================
-- GET SERVICE — database security verification
--
-- Asserts the properties the application relies on but cannot enforce itself:
-- role provisioning, protected columns, and Row Level Security.
--
-- Run against a local Supabase instance:
--     supabase db reset
--     psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/rls-verification.sql
--
-- Against a bare PostgreSQL server, apply supabase/tests/local-shim.sql first.
-- The script raises on the first failed assertion and rolls everything back, so
-- it is safe to run repeatedly and leaves no data behind.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'rls-customer@example.test',
   '{"full_name":"לקוח בדיקה","role":"customer"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'rls-provider@example.test',
   '{"full_name":"בעל מקצוע בדיקה","role":"provider"}'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'rls-outsider@example.test',
   '{"full_name":"זר","role":"admin"}');

do $$
declare
  v_provider uuid;
  v_job      uuid;
  v_plumbing uuid;
  v_actual   text;
  v_before   text;
  v_affected integer;
begin
  select id into v_plumbing from public.categories where slug = 'plumbing';

  -- ── 1. Signup can never mint an admin ─────────────────────────────────────
  select role::text into v_actual from public.users
   where id = 'aaaaaaaa-0000-4000-8000-000000000003';
  if v_actual <> 'customer' then
    raise exception 'FAIL: signup metadata granted the role %', v_actual;
  end if;
  raise notice 'PASS: signup cannot grant the admin role';

  -- ── 2. Provisioning created the right rows ────────────────────────────────
  select id into v_provider from public.provider_profiles
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_provider is null then
    raise exception 'FAIL: no provider profile was provisioned';
  end if;
  raise notice 'PASS: signup provisions user, profile and role-specific rows';

  update public.provider_profiles
     set status = 'verified', base_price = 350, completed_jobs = 1, rating_avg = 4.00, rating_count = 2
   where id = v_provider;

  insert into public.provider_categories (provider_id, category_id) values (v_provider, v_plumbing);
  insert into public.service_areas (provider_id, label, center_lat, center_lng, radius_km)
    values (v_provider, 'תל אביב', 32.0853, 34.7818, 15);
  insert into public.provider_availability (provider_id, is_available)
    values (v_provider, true)
    on conflict (provider_id) do update set is_available = true;
  insert into public.provider_locations (provider_id, lat, lng)
    values (v_provider, 32.0900, 34.7900)
    on conflict (provider_id) do update set lat = 32.0900, lng = 34.7900;

  -- ── 3. Geo discovery finds the provider ───────────────────────────────────
  if not exists (
    select 1 from public.find_nearby_providers(v_plumbing, 32.0853, 34.7818, 5) nearby
     where nearby.provider_id = v_provider
  ) then
    raise exception 'FAIL: find_nearby_providers did not return a provider in range';
  end if;
  raise notice 'PASS: find_nearby_providers returns in-range, verified providers';

  -- ── 4. Job creation logs its own history ──────────────────────────────────
  insert into public.jobs (customer_id, category_id, title, description, address, lat, lng)
  values ('aaaaaaaa-0000-4000-8000-000000000001', v_plumbing, 'בדיקת RLS',
          'עבודה שנוצרה על ידי סקריפט האימות', 'הרצל 5, תל אביב', 32.0853, 34.7818)
  returning id into v_job;

  if not exists (
    select 1 from public.job_status_history h
     where h.job_id = v_job and h.to_status = 'requested'
  ) then
    raise exception 'FAIL: job creation did not write a status history row';
  end if;
  raise notice 'PASS: every status change is recorded by a trigger';

  -- ── 5. The balance ledger ─────────────────────────────────────────────────
  -- A commission may never take a provider under the floor. This is the rule
  -- that turns enforcement into access control, and it lives in a trigger so
  -- that no code path — not even a service-role write — can hand out work on
  -- credit.
  update public.settings
     set value = jsonb_set(value, '{minimum_balance}', '0'::jsonb)
   where key = 'billing';

  begin
    insert into public.balance_entries (provider_id, type, amount, balance_after)
    values (v_provider, 'commission', -100, 0);
    raise exception 'FAIL: a commission was charged against an empty balance';
  exception
    when check_violation then raise notice 'PASS: a commission cannot overdraw the balance';
  end;

  -- A top-up credits the balance, and the trigger — not the caller — decides
  -- what `balance_after` is.
  insert into public.balance_entries (provider_id, type, amount, balance_after)
  values (v_provider, 'topup', 500, 999999);

  select balance::text into v_actual from public.provider_profiles where id = v_provider;
  if v_actual <> '500.00' then
    raise exception 'FAIL: a top-up did not credit the balance (balance=%)', v_actual;
  end if;

  select balance_after::text into v_actual
    from public.balance_entries
   where provider_id = v_provider and type = 'topup';
  if v_actual <> '500.00' then
    raise exception 'FAIL: the caller''s balance_after was trusted (stored=%)', v_actual;
  end if;
  raise notice 'PASS: the ledger trigger owns the balance, not the caller';

  -- The ledger is append-only: a correction is a new entry, never an edit.
  begin
    update public.balance_entries set amount = 9999 where provider_id = v_provider;
    raise exception 'FAIL: a ledger entry was rewritten';
  exception
    when restrict_violation then raise notice 'PASS: the ledger is append-only';
  end;

  insert into public.job_assignments (job_id, provider_id, match_score)
  values (v_job, v_provider, 90);
  insert into public.job_offers (job_id, provider_id, price, eta_minutes)
  values (v_job, v_provider, 600, 25);

  update public.jobs set status = 'offers_received' where id = v_job;
  update public.jobs set status = 'provider_selected', assigned_provider_id = v_provider where id = v_job;
  update public.jobs set status = 'in_progress' where id = v_job;
  update public.jobs set status = 'completed', completed_at = now() where id = v_job;

  -- The commission is charged at acceptance, out of the credit just bought.
  insert into public.balance_entries (provider_id, type, amount, balance_after, job_id)
  values (v_provider, 'commission', -90, 0, v_job);

  select balance::text into v_actual from public.provider_profiles where id = v_provider;
  if v_actual <> '410.00' then
    raise exception 'FAIL: the commission did not come out of the balance (balance=%)', v_actual;
  end if;

  update public.jobs
     set commission_amount = 90, commission_charged_at = now(),
         final_price = 600, platform_fee = 90, provider_payout = 510
   where id = v_job;

  -- One charge per job, enforced by a unique index rather than by the caller.
  begin
    insert into public.balance_entries (provider_id, type, amount, balance_after, job_id)
    values (v_provider, 'commission', -90, 0, v_job);
    raise exception 'FAIL: the same job was charged a commission twice';
  exception
    when unique_violation then raise notice 'PASS: a job can only be charged once';
  end;

  insert into public.reviews (job_id, customer_id, provider_id, rating, comment)
  values (v_job, 'aaaaaaaa-0000-4000-8000-000000000001', v_provider, 5, 'בדיקה');

  -- ── 6. Ratings aggregate over visible reviews only ────────────────────────
  select rating_count::text into v_actual from public.provider_profiles where id = v_provider;
  if v_actual <> '1' then
    raise exception 'FAIL: rating aggregate did not update (count=%)', v_actual;
  end if;

  update public.reviews set is_hidden = true where job_id = v_job;
  select rating_count::text into v_actual from public.provider_profiles where id = v_provider;
  if v_actual <> '0' then
    raise exception 'FAIL: hidden review still counts toward the rating (count=%)', v_actual;
  end if;
  update public.reviews set is_hidden = false where job_id = v_job;
  raise notice 'PASS: hidden reviews are excluded from the provider rating';

  -- ── 7. A provider cannot self-grant verification or stats ─────────────────
  -- Snapshot first: the triggers have been moving these values legitimately,
  -- so the assertion is "unchanged by the provider", not a fixed literal.
  select format('%s/%s/%s/%s', status, rating_avg, rating_count, completed_jobs)
    into v_before from public.provider_profiles where id = v_provider;

  set local role authenticated;
  set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000002';

  update public.provider_profiles
     set status = 'suspended', rating_avg = 5.00, rating_count = 99,
         completed_jobs = 999, business_name = 'שם ערוך'
   where id = v_provider;

  reset role;

  select format('%s/%s/%s/%s', status, rating_avg, rating_count, completed_jobs)
    into v_actual from public.provider_profiles where id = v_provider;
  if v_actual <> v_before then
    raise exception 'FAIL: a provider changed protected columns (% -> %)', v_before, v_actual;
  end if;

  select business_name into v_actual from public.provider_profiles where id = v_provider;
  if v_actual <> 'שם ערוך' then
    raise exception 'FAIL: a provider could not edit their own business name';
  end if;
  raise notice 'PASS: providers may edit presentation but not verification or stats';

  -- ── 8. A user cannot promote themselves ───────────────────────────────────
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000003';
  update public.users set role = 'admin' where id = 'aaaaaaaa-0000-4000-8000-000000000003';
  reset role;

  select role::text into v_actual from public.users where id = 'aaaaaaaa-0000-4000-8000-000000000003';
  if v_actual <> 'customer' then
    raise exception 'FAIL: a user promoted themselves to %', v_actual;
  end if;
  raise notice 'PASS: users cannot change their own role or account status';

  -- ── 9. Row visibility ─────────────────────────────────────────────────────
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000001';
  if (select count(*) from public.jobs j where j.id = v_job) <> 1 then
    raise exception 'FAIL: a customer cannot see their own job';
  end if;
  -- A customer has no business reading the platform's commission ledger: what
  -- GET SERVICE charges is between GET SERVICE and the provider.
  if (select count(*) from public.balance_entries) <> 0 then
    raise exception 'FAIL: a customer can read the commission ledger';
  end if;

  set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000002';
  if (select count(*) from public.jobs j where j.id = v_job) <> 1 then
    raise exception 'FAIL: the assigned provider cannot see the job';
  end if;
  if (select count(*) from public.balance_entries) <> 2 then
    raise exception
      'FAIL: a provider cannot read their own ledger (rows=%)',
      (select count(*) from public.balance_entries);
  end if;

  set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000003';
  if (select count(*) from public.jobs j where j.id = v_job) <> 0 then
    raise exception 'FAIL: an unrelated user can see somebody else’s job';
  end if;
  if (select count(*) from public.balance_entries) <> 0 then
    raise exception 'FAIL: an unrelated user can see the commission ledger';
  end if;
  if (select count(*) from public.provider_documents) <> 0 then
    raise exception 'FAIL: an unrelated user can see verification documents';
  end if;
  if (select count(*) from public.settings) <> 0 then
    raise exception 'FAIL: settings (including match weights) are readable by a non-admin';
  end if;
  if (select count(*) from public.categories) = 0 then
    raise exception 'FAIL: the public catalogue is not readable';
  end if;
  reset role;
  raise notice 'PASS: each role sees exactly its own rows';

  -- ── 10. An outsider cannot write on somebody else's behalf ────────────────
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000003';
  begin
    insert into public.jobs (customer_id, category_id, title, description, address, lat, lng)
    values ('aaaaaaaa-0000-4000-8000-000000000001', v_plumbing, 'מזויף', 'בשם מישהו אחר',
            'רחוב 1', 32.08, 34.78);
    raise exception 'FAIL: a job was created on behalf of another customer';
  exception
    when insufficient_privilege then raise notice 'PASS: cannot open a job for another customer';
  end;

  begin
    insert into public.reviews (job_id, customer_id, provider_id, rating)
    values (v_job, 'aaaaaaaa-0000-4000-8000-000000000003', v_provider, 1);
    raise exception 'FAIL: a review was accepted on a foreign job';
  exception
    when insufficient_privilege then raise notice 'PASS: cannot review a job that is not yours';
  end;
  reset role;

  -- ── 11. A provider cannot quote without a broadcast ───────────────────────
  declare
    v_unbroadcast uuid;
  begin
    insert into public.jobs (customer_id, category_id, title, description, address, lat, lng, status)
    values ('aaaaaaaa-0000-4000-8000-000000000001', v_plumbing, 'לא שודרה',
            'עבודה שלא שויכה לאיש', 'רחוב 2', 32.07, 34.79, 'searching')
    returning id into v_unbroadcast;

    set local role authenticated;
    set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000002';
    begin
      insert into public.job_offers (job_id, provider_id, price, eta_minutes)
      values (v_unbroadcast, v_provider, 100, 30);
      raise exception 'FAIL: an offer was accepted on a job that was never broadcast';
    exception
      when insufficient_privilege then
        raise notice 'PASS: a provider can only quote on jobs broadcast to them';
    end;
    reset role;
  end;

  -- ── 12. Reviews are immutable for providers ───────────────────────────────
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-4000-8000-000000000002';

  with removed as (delete from public.reviews returning 1)
  select count(*) into v_affected from removed;
  if v_affected <> 0 then
    raise exception 'FAIL: a provider deleted % review(s) about them', v_affected;
  end if;

  with edited as (update public.reviews set rating = 5, is_hidden = false returning 1)
  select count(*) into v_affected from edited;
  if v_affected <> 0 then
    raise exception 'FAIL: a provider edited % review(s) about them', v_affected;
  end if;
  reset role;
  raise notice 'PASS: providers can neither delete nor edit reviews';

  raise notice '';
  raise notice '✅ every database security assertion passed';
end $$;

-- Nothing is persisted: the script is a check, not a fixture.
rollback;
