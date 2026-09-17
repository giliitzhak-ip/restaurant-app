-- ============================================================================
-- GET SERVICE — 0006  Row Level Security
-- Every table is deny-by-default. The service role (server-side only) bypasses
-- RLS and is the sole writer for money, matching and notification rows.
-- ============================================================================

create or replace function public.shares_job_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.jobs j
    left join public.provider_profiles p on p.id = j.assigned_provider_id
    where (j.customer_id = auth.uid() and p.user_id = other_user)
       or (p.user_id = auth.uid() and j.customer_id = other_user)
  );
$$;

-- Stops a client from promoting itself or rewriting its own account status.
create or replace function public.guard_user_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role   := old.role;
  new.status := old.status;
  new.status_reason := old.status_reason;
  return new;
end;
$$;

drop trigger if exists guard_user_columns on public.users;
create trigger guard_user_columns
  before update on public.users
  for each row execute function public.guard_user_protected_columns();

-- Providers may edit their presentation, never their verification or stats.
create or replace function public.guard_provider_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  new.status               := old.status;
  new.status_reason        := old.status_reason;
  new.verified_at          := old.verified_at;
  new.rating_avg           := old.rating_avg;
  new.rating_count         := old.rating_count;
  new.completed_jobs       := old.completed_jobs;
  new.cancelled_jobs       := old.cancelled_jobs;
  new.avg_response_seconds := old.avg_response_seconds;
  return new;
end;
$$;

drop trigger if exists guard_provider_columns on public.provider_profiles;
create trigger guard_provider_columns
  before update on public.provider_profiles
  for each row execute function public.guard_provider_protected_columns();

-- ── Enable RLS everywhere ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'users','profiles','customer_profiles','categories','services',
    'provider_profiles','provider_categories','provider_services','service_areas',
    'provider_availability','provider_locations','provider_documents','provider_gallery',
    'jobs','job_images','job_offers','job_assignments','job_status_history',
    'messages','favorites','payments','payment_transactions','platform_fees',
    'reviews','review_categories','disputes','notifications','settings','admin_actions'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- ── users ───────────────────────────────────────────────────────────────────
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_job_with(id));

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users
  for insert to authenticated
  with check (public.is_admin());

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.shares_job_with(user_id));

drop policy if exists profiles_upsert_self on public.profiles;
create policy profiles_upsert_self on public.profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── customer_profiles ───────────────────────────────────────────────────────
drop policy if exists customer_profiles_own on public.customer_profiles;
create policy customer_profiles_own on public.customer_profiles
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── categories & services (public catalogue) ────────────────────────────────
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select to anon, authenticated using (active or public.is_admin());

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists services_read on public.services;
create policy services_read on public.services
  for select to anon, authenticated using (active or public.is_admin());

drop policy if exists services_write on public.services;
create policy services_write on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── provider_profiles ───────────────────────────────────────────────────────
drop policy if exists provider_profiles_read on public.provider_profiles;
create policy provider_profiles_read on public.provider_profiles
  for select to anon, authenticated
  using (status = 'verified' or user_id = auth.uid() or public.is_admin());

drop policy if exists provider_profiles_insert_self on public.provider_profiles;
create policy provider_profiles_insert_self on public.provider_profiles
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());

drop policy if exists provider_profiles_update_self on public.provider_profiles;
create policy provider_profiles_update_self on public.provider_profiles
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── provider sub-tables owned by the provider ───────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['provider_categories','provider_services','service_areas','provider_gallery'] loop
    execute format('drop policy if exists %I_read on public.%I;', t, t);
    execute format($p$
      create policy %I_read on public.%I
        for select to anon, authenticated
        using (
          public.is_admin()
          or exists (
            select 1 from public.provider_profiles p
            where p.id = %I.provider_id
              and (p.status = 'verified' or p.user_id = auth.uid())
          )
        );$p$, t, t, t);

    execute format('drop policy if exists %I_write on public.%I;', t, t);
    execute format($p$
      create policy %I_write on public.%I
        for all to authenticated
        using (
          public.is_admin()
          or exists (select 1 from public.provider_profiles p
                     where p.id = %I.provider_id and p.user_id = auth.uid())
        )
        with check (
          public.is_admin()
          or exists (select 1 from public.provider_profiles p
                     where p.id = %I.provider_id and p.user_id = auth.uid())
        );$p$, t, t, t, t);
  end loop;
end $$;

-- ── provider_availability ───────────────────────────────────────────────────
drop policy if exists availability_read on public.provider_availability;
create policy availability_read on public.provider_availability
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.provider_profiles p
               where p.id = provider_availability.provider_id
                 and (p.status = 'verified' or p.user_id = auth.uid()))
  );

drop policy if exists availability_write on public.provider_availability;
create policy availability_write on public.provider_availability
  for all to authenticated
  using (public.is_admin() or provider_id = public.current_provider_id())
  with check (public.is_admin() or provider_id = public.current_provider_id());

-- ── provider_locations (sensitive: live position) ───────────────────────────
drop policy if exists locations_read on public.provider_locations;
create policy locations_read on public.provider_locations
  for select to authenticated
  using (
    public.is_admin()
    or provider_id = public.current_provider_id()
    -- the customer may follow the provider only while they are en route
    or exists (
      select 1 from public.jobs j
      where j.assigned_provider_id = provider_locations.provider_id
        and j.customer_id = auth.uid()
        and j.status in ('provider_selected', 'provider_on_the_way', 'arrived', 'in_progress')
    )
  );

drop policy if exists locations_write on public.provider_locations;
create policy locations_write on public.provider_locations
  for all to authenticated
  using (public.is_admin() or provider_id = public.current_provider_id())
  with check (public.is_admin() or provider_id = public.current_provider_id());

-- ── provider_documents (private, never public) ──────────────────────────────
drop policy if exists documents_read on public.provider_documents;
create policy documents_read on public.provider_documents
  for select to authenticated
  using (public.is_admin() or provider_id = public.current_provider_id());

drop policy if exists documents_insert on public.provider_documents;
create policy documents_insert on public.provider_documents
  for insert to authenticated
  with check (provider_id = public.current_provider_id());

drop policy if exists documents_update on public.provider_documents;
create policy documents_update on public.provider_documents
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── jobs ────────────────────────────────────────────────────────────────────
drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs
  for select to authenticated using (public.can_access_job(id));

drop policy if exists jobs_insert_customer on public.jobs;
create policy jobs_insert_customer on public.jobs
  for insert to authenticated
  with check (customer_id = auth.uid() and public.auth_role() = 'customer');

drop policy if exists jobs_update_participants on public.jobs;
create policy jobs_update_participants on public.jobs
  for update to authenticated
  using (
    public.is_admin()
    or customer_id = auth.uid()
    or assigned_provider_id = public.current_provider_id()
  )
  with check (
    public.is_admin()
    or customer_id = auth.uid()
    or assigned_provider_id = public.current_provider_id()
  );

-- ── job_images ──────────────────────────────────────────────────────────────
drop policy if exists job_images_read on public.job_images;
create policy job_images_read on public.job_images
  for select to authenticated using (public.can_access_job(job_id));

drop policy if exists job_images_write on public.job_images;
create policy job_images_write on public.job_images
  for all to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_images.job_id and j.customer_id = auth.uid()))
  with check (exists (select 1 from public.jobs j where j.id = job_images.job_id and j.customer_id = auth.uid()));

-- ── job_offers ──────────────────────────────────────────────────────────────
drop policy if exists job_offers_read on public.job_offers;
create policy job_offers_read on public.job_offers
  for select to authenticated
  using (
    public.is_admin()
    or provider_id = public.current_provider_id()
    or exists (select 1 from public.jobs j where j.id = job_offers.job_id and j.customer_id = auth.uid())
  );

drop policy if exists job_offers_insert on public.job_offers;
create policy job_offers_insert on public.job_offers
  for insert to authenticated
  with check (
    provider_id = public.current_provider_id()
    and exists (
      select 1 from public.job_assignments a
      join public.jobs j on j.id = a.job_id
      where a.job_id = job_offers.job_id
        and a.provider_id = job_offers.provider_id
        and j.status in ('requested', 'searching', 'offers_received')
    )
  );

drop policy if exists job_offers_update on public.job_offers;
create policy job_offers_update on public.job_offers
  for update to authenticated
  using (
    public.is_admin()
    or provider_id = public.current_provider_id()
    or exists (select 1 from public.jobs j where j.id = job_offers.job_id and j.customer_id = auth.uid())
  )
  with check (
    public.is_admin()
    or provider_id = public.current_provider_id()
    or exists (select 1 from public.jobs j where j.id = job_offers.job_id and j.customer_id = auth.uid())
  );

-- ── job_assignments (written by the match engine / service role only) ───────
drop policy if exists job_assignments_read on public.job_assignments;
create policy job_assignments_read on public.job_assignments
  for select to authenticated
  using (
    public.is_admin()
    or provider_id = public.current_provider_id()
    or exists (select 1 from public.jobs j where j.id = job_assignments.job_id and j.customer_id = auth.uid())
  );

drop policy if exists job_assignments_update_provider on public.job_assignments;
create policy job_assignments_update_provider on public.job_assignments
  for update to authenticated
  using (provider_id = public.current_provider_id() or public.is_admin())
  with check (provider_id = public.current_provider_id() or public.is_admin());

-- ── job_status_history ──────────────────────────────────────────────────────
drop policy if exists job_status_history_read on public.job_status_history;
create policy job_status_history_read on public.job_status_history
  for select to authenticated using (public.can_access_job(job_id));

-- ── messages ────────────────────────────────────────────────────────────────
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select to authenticated
  using (public.is_admin() or public.can_chat_on_job(job_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_chat_on_job(job_id));

drop policy if exists messages_update_read on public.messages;
create policy messages_update_read on public.messages
  for update to authenticated
  using (public.can_chat_on_job(job_id))
  with check (public.can_chat_on_job(job_id));

-- ── favorites ───────────────────────────────────────────────────────────────
drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for all to authenticated
  using (customer_id = auth.uid() or public.is_admin())
  with check (customer_id = auth.uid());

-- ── payments (read-only for the parties, written server-side) ───────────────
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select to authenticated
  using (
    public.is_admin()
    or customer_id = auth.uid()
    or provider_id = public.current_provider_id()
  );

drop policy if exists payment_transactions_read on public.payment_transactions;
create policy payment_transactions_read on public.payment_transactions
  for select to authenticated using (public.is_admin());

drop policy if exists platform_fees_read on public.platform_fees;
create policy platform_fees_read on public.platform_fees
  for select to authenticated using (public.is_admin());

-- ── reviews ─────────────────────────────────────────────────────────────────
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews
  for select to anon, authenticated
  using (
    not is_hidden
    or public.is_admin()
    or customer_id = auth.uid()
  );

drop policy if exists reviews_insert_customer on public.reviews;
create policy reviews_insert_customer on public.reviews
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.jobs j
      where j.id = reviews.job_id
        and j.customer_id = auth.uid()
        and j.status = 'completed'
    )
  );

-- Only an admin may moderate. Nobody — provider included — may delete.
drop policy if exists reviews_moderate on public.reviews;
create policy reviews_moderate on public.reviews
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists review_categories_read on public.review_categories;
create policy review_categories_read on public.review_categories
  for select to anon, authenticated
  using (exists (select 1 from public.reviews r
                 where r.id = review_categories.review_id
                   and (not r.is_hidden or public.is_admin() or r.customer_id = auth.uid())));

drop policy if exists review_categories_insert on public.review_categories;
create policy review_categories_insert on public.review_categories
  for insert to authenticated
  with check (exists (select 1 from public.reviews r
                      where r.id = review_categories.review_id and r.customer_id = auth.uid()));

-- ── disputes ────────────────────────────────────────────────────────────────
drop policy if exists disputes_read on public.disputes;
create policy disputes_read on public.disputes
  for select to authenticated
  using (public.is_admin() or opened_by = auth.uid() or public.can_access_job(job_id));

drop policy if exists disputes_insert on public.disputes;
create policy disputes_insert on public.disputes
  for insert to authenticated
  with check (opened_by = auth.uid() and public.can_access_job(job_id));

drop policy if exists disputes_update_admin on public.disputes;
create policy disputes_update_admin on public.disputes
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── notifications ───────────────────────────────────────────────────────────
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── settings & admin_actions (admin only; server reads via service role) ────
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_actions_admin on public.admin_actions;
create policy admin_actions_admin on public.admin_actions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Table privileges ────────────────────────────────────────────────────────
-- Supabase's default privileges usually cover this, but granting explicitly
-- keeps the schema self-contained: RLS is what restricts rows, and these grants
-- are what make the policies reachable at all.
grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Same defaults for anything a later migration adds.
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
