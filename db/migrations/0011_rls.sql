-- ===========================================================================
-- 0011 — Row Level Security (spec §23, §45)
--
-- Every table exposed to a user-facing connection has RLS enabled and a
-- default-deny posture: no policy means no access. The application connects
-- as `authenticated` with request.jwt.claims set, exactly as PostgREST does
-- on Supabase, so these policies are the real enforcement path — not a
-- frontend check.
--
-- Trusted server-only work (dispatch, matching, payment capture) uses the
-- `service_role`, which is BYPASSRLS and is never reachable from a browser.
-- ===========================================================================

-- ── Enable RLS everywhere ─────────────────────────────────────────────────
alter table public.profiles                  enable row level security;
alter table public.customer_profiles         enable row level security;
alter table public.provider_profiles         enable row level security;
alter table public.provider_payout_details   enable row level security;
alter table public.provider_admin_notes      enable row level security;
alter table public.provider_availability     enable row level security;
alter table public.user_sessions             enable row level security;
alter table public.categories                enable row level security;
alter table public.services                  enable row level security;
alter table public.provider_categories       enable row level security;
alter table public.provider_services         enable row level security;
alter table public.service_areas             enable row level security;
alter table public.jobs                      enable row level security;
alter table public.job_images                enable row level security;
alter table public.job_offers                enable row level security;
alter table public.job_assignments           enable row level security;
alter table public.job_status_history        enable row level security;
alter table public.job_transitions           enable row level security;
alter table public.provider_locations        enable row level security;
alter table public.provider_location_history enable row level security;
alter table public.payments                  enable row level security;
alter table public.payment_transactions      enable row level security;
alter table public.platform_fees             enable row level security;
alter table public.reviews                   enable row level security;
alter table public.provider_documents        enable row level security;
alter table public.disputes                  enable row level security;
alter table public.messages                  enable row level security;
alter table public.notifications             enable row level security;
alter table public.settings                  enable row level security;
alter table public.admin_actions             enable row level security;
alter table public.matching_events           enable row level security;

-- ── Helper: do I share an active job with this user? ──────────────────────
-- Lets a matched customer and provider see each other's display profile
-- without opening up the whole user table. SECURITY DEFINER to avoid
-- recursive policy evaluation.
create or replace function public.shares_active_job_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    left join public.job_assignments ja on ja.job_id = j.id
    where (
            (j.customer_id = auth.uid() and ja.provider_id = p_other)
         or (ja.provider_id = auth.uid() and j.customer_id = p_other)
          )
      and j.status not in ('CANCELLED_BY_CUSTOMER','CANCELLED_BY_PROVIDER','CANCELLED_BY_SYSTEM')
    union all
    -- A provider holding a live offer may see the requesting customer.
    select 1
    from public.jobs j
    join public.job_offers o on o.job_id = j.id
    where o.provider_id = auth.uid()
      and j.customer_id = p_other
      and o.status in ('PENDING','ACCEPTED')
  )
$$;

-- ── Non-recursive policy helpers ──────────────────────────────────────────
-- A policy on `jobs` must not query `job_offers`, because the policy on
-- `job_offers` queries `jobs` — Postgres detects that as infinite recursion
-- and fails the query. Every cross-table lookup used inside a policy is
-- therefore wrapped in a SECURITY DEFINER function, which runs with the
-- owner's rights and so does NOT trigger policy evaluation on the inner
-- table. The authorization logic is unchanged; only the recursion is broken.
create or replace function public.job_customer_id(p_job_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select customer_id from public.jobs where id = p_job_id
$$;

create or replace function public.provider_has_interest_in_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.job_assignments
    where job_id = p_job_id and provider_id = auth.uid()
  ) or exists (
    select 1 from public.job_offers
    where job_id = p_job_id and provider_id = auth.uid()
  )
$$;

create or replace function public.provider_assigned_to_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.job_assignments
    where job_id = p_job_id and provider_id = auth.uid()
  )
$$;

-- May the calling customer see this provider's live position right now?
-- True only while one of their own jobs is genuinely in flight (spec §24).
create or replace function public.customer_may_track_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.job_assignments ja
    join public.jobs j on j.id = ja.job_id
    where ja.provider_id = p_provider_id
      and j.customer_id = auth.uid()
      and j.status in ('CONFIRMED','EN_ROUTE','ARRIVED','IN_PROGRESS')
  )
$$;

-- Is the caller entitled to post this review? (spec §30)
create or replace function public.can_review(
  p_job_id uuid, p_subject_id uuid, p_direction text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    join public.job_assignments ja on ja.job_id = j.id
    where j.id = p_job_id
      and j.status in ('COMPLETED','PAID','REVIEWED')
      and (
        (p_direction = 'customer_to_provider'
           and j.customer_id = auth.uid() and ja.provider_id = p_subject_id)
        or
        (p_direction = 'provider_to_customer'
           and ja.provider_id = auth.uid() and j.customer_id = p_subject_id)
      )
  )
$$;

create or replace function public.is_job_participant(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id and j.customer_id = auth.uid()
  ) or exists (
    select 1 from public.job_assignments ja
    where ja.job_id = p_job_id and ja.provider_id = auth.uid()
  ) or exists (
    select 1 from public.job_offers o
    where o.job_id = p_job_id and o.provider_id = auth.uid()
  )
$$;

-- ── profiles ──────────────────────────────────────────────────────────────
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or public.is_admin()
    or public.shares_active_job_with(id)
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Role escalation guard: a user may never change their own role.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role <> old.role and not public.is_admin() then
    raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ── customer_profiles ─────────────────────────────────────────────────────
drop policy if exists customer_profiles_rw on public.customer_profiles;
create policy customer_profiles_rw on public.customer_profiles
  for select using (
    id = auth.uid() or public.is_admin() or public.shares_active_job_with(id)
  );

drop policy if exists customer_profiles_update_own on public.customer_profiles;
create policy customer_profiles_update_own on public.customer_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── provider_profiles ─────────────────────────────────────────────────────
-- A verified provider's trust signals are readable by any signed-in user:
-- the customer must be able to see who was matched to them. Sensitive data
-- is NOT in this table (see provider_payout_details / provider_admin_notes).
drop policy if exists provider_profiles_select on public.provider_profiles;
create policy provider_profiles_select on public.provider_profiles
  for select using (
    id = auth.uid() or public.is_admin() or verification = 'VERIFIED'
  );

drop policy if exists provider_profiles_update_own on public.provider_profiles;
create policy provider_profiles_update_own on public.provider_profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- A provider may not verify or unsuspend themselves.
create or replace function public.guard_provider_verification()
returns trigger
language plpgsql
as $$
begin
  if new.verification <> old.verification and not public.is_admin() then
    raise exception 'VERIFICATION_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists provider_profiles_guard_verification on public.provider_profiles;
create trigger provider_profiles_guard_verification before update on public.provider_profiles
  for each row execute function public.guard_provider_verification();

-- ── provider private data ─────────────────────────────────────────────────
drop policy if exists provider_payout_own on public.provider_payout_details;
create policy provider_payout_own on public.provider_payout_details
  for all using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

drop policy if exists provider_admin_notes_admin_only on public.provider_admin_notes;
create policy provider_admin_notes_admin_only on public.provider_admin_notes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists provider_availability_own on public.provider_availability;
create policy provider_availability_own on public.provider_availability
  for select using (provider_id = auth.uid() or public.is_admin());

-- ── sessions: a user may only ever see or revoke their own ────────────────
drop policy if exists user_sessions_own on public.user_sessions;
create policy user_sessions_own on public.user_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── catalog: public read, admin write ─────────────────────────────────────
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists services_read on public.services;
create policy services_read on public.services for select using (true);
drop policy if exists services_admin_write on public.services;
create policy services_admin_write on public.services
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists job_transitions_read on public.job_transitions;
create policy job_transitions_read on public.job_transitions for select using (true);

-- ── provider capability rows: owner manages, everyone may read ────────────
drop policy if exists provider_categories_read on public.provider_categories;
create policy provider_categories_read on public.provider_categories for select using (true);
drop policy if exists provider_categories_own_write on public.provider_categories;
create policy provider_categories_own_write on public.provider_categories
  for all using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

drop policy if exists provider_services_read on public.provider_services;
create policy provider_services_read on public.provider_services for select using (true);
drop policy if exists provider_services_own_write on public.provider_services;
create policy provider_services_own_write on public.provider_services
  for all using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

drop policy if exists service_areas_read on public.service_areas;
create policy service_areas_read on public.service_areas for select using (true);
drop policy if exists service_areas_own_write on public.service_areas;
create policy service_areas_own_write on public.service_areas
  for all using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

-- ── jobs ──────────────────────────────────────────────────────────────────
drop policy if exists jobs_select_participant on public.jobs;
create policy jobs_select_participant on public.jobs
  for select using (
    customer_id = auth.uid()
    or public.is_admin()
    or public.provider_has_interest_in_job(id)
  );

-- A customer creates jobs only for themselves.
drop policy if exists jobs_insert_own on public.jobs;
create policy jobs_insert_own on public.jobs
  for insert with check (customer_id = auth.uid());

-- Participants may update; the transition trigger decides which status
-- changes each role is allowed to make.
drop policy if exists jobs_update_participant on public.jobs;
create policy jobs_update_participant on public.jobs
  for update using (
    customer_id = auth.uid()
    or public.is_admin()
    or public.provider_assigned_to_job(id)
  )
  with check (
    customer_id = auth.uid()
    or public.is_admin()
    or public.provider_assigned_to_job(id)
  );

-- ── job_images ────────────────────────────────────────────────────────────
drop policy if exists job_images_participant on public.job_images;
create policy job_images_participant on public.job_images
  for select using (public.is_job_participant(job_id) or public.is_admin());
drop policy if exists job_images_insert_participant on public.job_images;
create policy job_images_insert_participant on public.job_images
  for insert with check (uploaded_by = auth.uid() and public.is_job_participant(job_id));

-- ── job_offers ────────────────────────────────────────────────────────────
-- A provider sees only their own offers. This is what stops one provider
-- from reading — or accepting — another provider's offer (spec §49).
drop policy if exists job_offers_select_scoped on public.job_offers;
create policy job_offers_select_scoped on public.job_offers
  for select using (
    provider_id = auth.uid()
    or public.is_admin()
    or public.job_customer_id(job_id) = auth.uid()
  );

-- Providers may only ever modify their own offer row (i.e. decline it).
-- Acceptance goes through accept_job_offer() so it is transactional.
drop policy if exists job_offers_update_own on public.job_offers;
create policy job_offers_update_own on public.job_offers
  for update using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

-- ── job_assignments ───────────────────────────────────────────────────────
drop policy if exists job_assignments_select_scoped on public.job_assignments;
create policy job_assignments_select_scoped on public.job_assignments
  for select using (
    provider_id = auth.uid()
    or public.is_admin()
    or public.job_customer_id(job_id) = auth.uid()
  );

drop policy if exists job_assignments_update_own on public.job_assignments;
create policy job_assignments_update_own on public.job_assignments
  for update using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

-- ── timeline: readable by participants, never writable by them ────────────
drop policy if exists job_status_history_select on public.job_status_history;
create policy job_status_history_select on public.job_status_history
  for select using (public.is_job_participant(job_id) or public.is_admin());

-- ── provider_locations ────────────────────────────────────────────────────
-- The provider owns their own row. A customer may read it only while their
-- own job is actually in flight (spec §17, §24) — not before, not after.
drop policy if exists provider_locations_own on public.provider_locations;
create policy provider_locations_own on public.provider_locations
  for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());

drop policy if exists provider_locations_customer_tracking on public.provider_locations;
create policy provider_locations_customer_tracking on public.provider_locations
  for select using (
    public.is_admin()
    or public.customer_may_track_provider(provider_id)
  );

drop policy if exists provider_location_history_own on public.provider_location_history;
create policy provider_location_history_own on public.provider_location_history
  for select using (provider_id = auth.uid() or public.is_admin());
drop policy if exists provider_location_history_insert_own on public.provider_location_history;
create policy provider_location_history_insert_own on public.provider_location_history
  for insert with check (provider_id = auth.uid());

-- ── payments ──────────────────────────────────────────────────────────────
-- Readable by the two parties; never writable by them. All mutations happen
-- server-side through the payment service (spec §27, §45).
drop policy if exists payments_select_parties on public.payments;
create policy payments_select_parties on public.payments
  for select using (
    customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin()
  );

drop policy if exists payment_transactions_admin on public.payment_transactions;
create policy payment_transactions_admin on public.payment_transactions
  for select using (public.is_admin());

drop policy if exists platform_fees_admin on public.platform_fees;
create policy platform_fees_admin on public.platform_fees
  for all using (public.is_admin()) with check (public.is_admin());

-- ── reviews ───────────────────────────────────────────────────────────────
-- Reviews are public (they are the trust signal), but may only be written by
-- a participant of a job that actually completed (spec §30).
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (true);

drop policy if exists reviews_insert_participant on public.reviews;
create policy reviews_insert_participant on public.reviews
  for insert with check (
    author_id = auth.uid()
    and public.can_review(job_id, subject_id, direction)
  );

-- ── documents: private to the provider and admins (spec §31) ──────────────
drop policy if exists provider_documents_own on public.provider_documents;
create policy provider_documents_own on public.provider_documents
  for select using (provider_id = auth.uid() or public.is_admin());
drop policy if exists provider_documents_insert_own on public.provider_documents;
create policy provider_documents_insert_own on public.provider_documents
  for insert with check (provider_id = auth.uid());
drop policy if exists provider_documents_admin_update on public.provider_documents;
create policy provider_documents_admin_update on public.provider_documents
  for update using (public.is_admin()) with check (public.is_admin());

-- ── disputes / messages / notifications ───────────────────────────────────
drop policy if exists disputes_participant on public.disputes;
create policy disputes_participant on public.disputes
  for select using (public.is_job_participant(job_id) or public.is_admin());
drop policy if exists disputes_insert_participant on public.disputes;
create policy disputes_insert_participant on public.disputes
  for insert with check (opened_by = auth.uid() and public.is_job_participant(job_id));
drop policy if exists disputes_admin_update on public.disputes;
create policy disputes_admin_update on public.disputes
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists messages_participant on public.messages;
create policy messages_participant on public.messages
  for select using (public.is_job_participant(job_id) or public.is_admin());
drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert with check (sender_id = auth.uid() and public.is_job_participant(job_id));

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── admin-only surfaces ───────────────────────────────────────────────────
-- Matching weights and dispatch configuration are not customer-visible
-- (spec §14: never hard-coded into frontend code — and not shipped to it).
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_actions_admin on public.admin_actions;
create policy admin_actions_admin on public.admin_actions
  for select using (public.is_admin());

-- Raw scoring is internal (spec §34: never exposed to customers).
drop policy if exists matching_events_admin on public.matching_events;
create policy matching_events_admin on public.matching_events
  for select using (public.is_admin());

-- ===========================================================================
-- Grants. RLS only filters rows a role already has privileges on, so the
-- privilege grant and the policy are both required.
-- ===========================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.categories, public.services, public.job_transitions,
  public.provider_categories, public.provider_services, public.service_areas,
  public.profiles, public.customer_profiles, public.provider_profiles,
  public.provider_availability,
  public.jobs, public.job_images, public.job_offers, public.job_assignments,
  public.job_status_history, public.provider_locations,
  public.provider_location_history, public.payments, public.reviews,
  public.provider_documents, public.disputes, public.messages,
  public.notifications, public.matching_events, public.admin_actions,
  public.payment_transactions, public.platform_fees, public.settings,
  public.provider_payout_details, public.provider_admin_notes
to authenticated;

grant insert on
  public.jobs, public.job_images, public.reviews, public.disputes,
  public.messages, public.provider_documents, public.service_areas,
  public.provider_categories, public.provider_services,
  public.provider_location_history, public.provider_locations,
  public.provider_payout_details
to authenticated;

grant update on
  public.profiles, public.customer_profiles, public.provider_profiles,
  public.jobs, public.job_offers, public.job_assignments,
  public.provider_locations, public.notifications, public.service_areas,
  public.provider_services, public.provider_categories,
  public.provider_payout_details, public.provider_documents, public.disputes
to authenticated;

grant delete on
  public.service_areas, public.provider_services, public.provider_categories
to authenticated;

-- Admin-managed reference data.
grant insert, update, delete on
  public.categories, public.services, public.settings, public.platform_fees,
  public.provider_admin_notes
to authenticated;

grant insert on public.admin_actions to authenticated;

-- Sessions are managed by the server, but scoped by RLS as a second layer.
grant select, insert, update on public.user_sessions to authenticated;

-- service_role is BYPASSRLS and used only by trusted server code.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.accept_job_offer(uuid) to authenticated, service_role;
grant execute on function public.find_candidate_providers(uuid, numeric, integer, integer) to service_role;
grant execute on function public.expire_stale_offers() to service_role;
grant execute on function public.can_transition(job_status, job_status, text) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_job_participant(uuid) to authenticated, service_role;
grant execute on function public.shares_active_job_with(uuid) to authenticated, service_role;
grant execute on function public.current_role_name() to authenticated, service_role;
grant execute on function public.job_customer_id(uuid) to authenticated, service_role;
grant execute on function public.provider_has_interest_in_job(uuid) to authenticated, service_role;
grant execute on function public.provider_assigned_to_job(uuid) to authenticated, service_role;
grant execute on function public.customer_may_track_provider(uuid) to authenticated, service_role;
grant execute on function public.can_review(uuid, uuid, text) to authenticated, service_role;
