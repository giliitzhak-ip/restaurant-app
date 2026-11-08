-- ============================================================================
-- GET SERVICE — 0009  Prepaid balance, commission at acceptance, job verification
--
-- Replaces the customer-pays-the-platform model. GET SERVICE is no longer in
-- the path of the job's money: the customer settles with the provider directly.
-- Instead the provider holds a prepaid balance, and the commission is taken the
-- moment an offer is accepted — an event the platform owns and both parties see.
--
-- That turns enforcement from debt collection into access control: an empty
-- balance simply stops new work. What remains to supervise is whether a booking
-- was real, which is what the verification columns below record.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.balance_entry_type as enum (
    'topup',              -- provider added credit
    'commission',         -- charged when an offer was accepted
    'commission_refund',  -- booking fell through and the charge was returned
    'adjustment'          -- manual correction by an admin
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_stage as enum ('request', 'completion');
exception when duplicate_object then null; end $$;

-- ── The old customer-payment model is gone, not left dangling ───────────────
drop table if exists public.platform_fees cascade;
drop table if exists public.payment_transactions cascade;
drop table if exists public.payments cascade;
drop type if exists public.transaction_type;

-- ── Provider balance ────────────────────────────────────────────────────────
alter table public.provider_profiles
  add column if not exists balance numeric(10, 2) not null default 0,
  add column if not exists low_balance_notified_at timestamptz;

comment on column public.provider_profiles.balance is
  'Prepaid credit in ILS. Maintained solely by the balance_entries trigger — never written directly.';

create table if not exists public.balance_entries (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.provider_profiles (id) on delete cascade,
  type           public.balance_entry_type not null,
  -- Signed: positive adds credit, negative consumes it.
  amount         numeric(10, 2) not null check (amount <> 0),
  balance_after  numeric(10, 2) not null,
  job_id         uuid references public.jobs (id) on delete set null,
  description    text,
  -- Identifier from the payment provider, for a top-up.
  external_id    text,
  rule_snapshot  jsonb not null default '{}'::jsonb,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint balance_entries_sign check (
    (type in ('topup') and amount > 0)
    or (type = 'commission' and amount < 0)
    or (type = 'commission_refund' and amount > 0)
    or (type = 'adjustment')
  )
);
comment on table public.balance_entries is
  'Append-only ledger. Every movement of provider credit is a row; the balance is the running total.';

-- One commission charge per job, and one refund per job at most.
create unique index if not exists idx_balance_entries_one_commission
  on public.balance_entries (job_id) where type = 'commission';
create unique index if not exists idx_balance_entries_one_refund
  on public.balance_entries (job_id) where type = 'commission_refund';

create index if not exists idx_balance_entries_provider
  on public.balance_entries (provider_id, created_at desc);
create index if not exists idx_balance_entries_type
  on public.balance_entries (type, created_at desc);

-- ── Commission and verification on the job ──────────────────────────────────
alter table public.jobs
  add column if not exists commission_amount numeric(10, 2),
  add column if not exists commission_charged_at timestamptz,
  add column if not exists commission_refunded_at timestamptz,
  -- Arrival check-in, compared against the job's own coordinates.
  add column if not exists arrival_lat double precision,
  add column if not exists arrival_lng double precision,
  add column if not exists arrival_distance_m numeric(10, 2),
  add column if not exists arrival_verified_at timestamptz,
  -- The customer's own confirmation that the work happened.
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_reported_price numeric(10, 2),
  add column if not exists customer_confirmed_by uuid references public.users (id) on delete set null;

comment on column public.jobs.commission_amount is
  'Charged to the provider''s balance when the offer was accepted, not when the work finished.';
comment on column public.jobs.arrival_distance_m is
  'Metres between the provider''s check-in and the job address. Recorded even when it is too far to count as verified.';

create index if not exists idx_jobs_commission_charged
  on public.jobs (commission_charged_at) where commission_charged_at is not null;
create index if not exists idx_jobs_unconfirmed
  on public.jobs (completed_at) where status = 'completed' and customer_confirmed_at is null;

-- Completion photos live alongside the request photos, distinguished by stage.
alter table public.job_images
  add column if not exists stage public.media_stage not null default 'request';

create index if not exists idx_job_images_stage on public.job_images (job_id, stage);

-- ── Balance maintenance ─────────────────────────────────────────────────────
-- The ledger is the source of truth; provider_profiles.balance is a cache of it.
create or replace function public.apply_balance_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_balance numeric(10, 2);
  floor_balance   numeric(10, 2);
begin
  -- FOR UPDATE serialises concurrent entries for one provider, which is what
  -- makes the floor check below race-free: two offers accepted at the same
  -- instant cannot both read the same balance and both pass.
  select balance into current_balance
    from public.provider_profiles
   where id = new.provider_id
     for update;

  if current_balance is null then
    raise exception 'provider % not found', new.provider_id;
  end if;

  new.balance_after := round(current_balance + new.amount, 2);

  -- A commission may never push a provider under the floor. This lives in the
  -- database rather than the API so that no code path — a future route, a
  -- script, a direct service-role write — can hand out work on credit.
  if new.type = 'commission' then
    select coalesce((value ->> 'minimum_balance')::numeric, 0)
      into floor_balance
      from public.settings
     where key = 'billing';

    if new.balance_after < coalesce(floor_balance, 0) then
      raise exception
        'insufficient balance: % would leave %, floor is %',
        new.amount, new.balance_after, coalesce(floor_balance, 0)
        using errcode = 'check_violation';
    end if;
  end if;

  update public.provider_profiles
     set balance = new.balance_after
   where id = new.provider_id;

  return new;
end;
$$;

drop trigger if exists apply_balance_entry on public.balance_entries;
create trigger apply_balance_entry
  before insert on public.balance_entries
  for each row execute function public.apply_balance_entry();

-- The ledger is append-only: a correction is a new entry, never an edit.
create or replace function public.forbid_balance_rewrite()
returns trigger
language plpgsql
as $$
begin
  -- A distinct errcode so a test can tell this refusal apart from its own
  -- assertion failures, which use the default P0001.
  raise exception 'balance_entries is append-only; post an adjustment entry instead'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists forbid_balance_rewrite on public.balance_entries;
create trigger forbid_balance_rewrite
  before update or delete on public.balance_entries
  for each row execute function public.forbid_balance_rewrite();

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.balance_entries enable row level security;
alter table public.balance_entries force row level security;

drop policy if exists balance_entries_read on public.balance_entries;
create policy balance_entries_read on public.balance_entries
  for select to authenticated
  using (public.is_admin() or provider_id = public.current_provider_id());

-- No insert/update/delete policy: only the service role writes the ledger.

grant select on public.balance_entries to authenticated;
grant all privileges on public.balance_entries to service_role;


-- ── Top-ups ─────────────────────────────────────────────────────────────────
-- The one place the platform still charges a card, and the provider is the
-- payer. It buys credit; it is not part of any job's payment.
create table if not exists public.provider_topups (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.provider_profiles (id) on delete cascade,
  amount          numeric(10, 2) not null check (amount > 0),
  currency        text not null default 'ILS',
  status          public.payment_status not null default 'pending',
  gateway         text not null,
  external_id     text,
  failure_reason  text,
  -- Set once the charge settled and the ledger entry was written. Its presence
  -- is what stops a replayed webhook from crediting the balance twice.
  balance_entry_id uuid references public.balance_entries (id) on delete set null,
  captured_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.provider_topups is
  'A provider buying credit. The customer never appears here: GET SERVICE is not in the path of a job''s money.';

create unique index if not exists idx_provider_topups_external
  on public.provider_topups (gateway, external_id) where external_id is not null;
create index if not exists idx_provider_topups_provider
  on public.provider_topups (provider_id, created_at desc);
create index if not exists idx_provider_topups_status
  on public.provider_topups (status, created_at desc);

drop trigger if exists set_updated_at on public.provider_topups;
create trigger set_updated_at before update on public.provider_topups
  for each row execute function public.set_updated_at();

alter table public.provider_topups enable row level security;
alter table public.provider_topups force row level security;

drop policy if exists provider_topups_read on public.provider_topups;
create policy provider_topups_read on public.provider_topups
  for select to authenticated
  using (public.is_admin() or provider_id = public.current_provider_id());

grant select on public.provider_topups to authenticated;
grant all privileges on public.provider_topups to service_role;

-- ── Settings for the new model ──────────────────────────────────────────────
insert into public.settings (key, value, description) values
  ('billing', jsonb_build_object(
      'minimum_balance', 0,
      'low_balance_threshold', 150,
      'refund_on_customer_cancellation', true,
      'refund_on_provider_cancellation', false,
      'refund_window_hours', 48,
      'topup_presets', jsonb_build_array(100, 250, 500, 1000)
    ), 'Prepaid balance rules. The commission is charged when an offer is accepted.'),

  ('verification', jsonb_build_object(
      'arrival_radius_m', 300,
      'require_arrival_checkin', true,
      'require_completion_photo', false,
      'require_customer_confirmation', true,
      'auto_confirm_after_hours', 48,
      'flag_price_gap_percent', 0.25
    ), 'How a job proves it actually happened: arrival check-in, evidence and customer confirmation.')
on conflict (key) do nothing;

-- ── Leakage signals ─────────────────────────────────────────────────────────
-- A booking the platform charged for that never showed any sign of happening
-- is the shape taken off-platform work leaves behind. These two functions are
-- the admin panel's read of that. Both are service-role only: the matching
-- API routes already gate on an admin session before they query.
create or replace function public.provider_integrity_report(min_accepted integer default 3)
returns table (
  provider_id          uuid,
  business_name        text,
  accepted             bigint,
  completed            bigint,
  customer_confirmed   bigint,
  arrival_verified     bigint,
  cancelled_after_accept bigint,
  commission_charged   numeric,
  commission_refunded  numeric,
  completion_rate      numeric,
  confirmation_rate    numeric
)
language sql
stable
security invoker
as $$
  select
    p.id,
    p.business_name,
    count(j.id) as accepted,
    count(j.id) filter (where j.status = 'completed') as completed,
    count(j.id) filter (where j.customer_confirmed_at is not null) as customer_confirmed,
    count(j.id) filter (where j.arrival_verified_at is not null) as arrival_verified,
    count(j.id) filter (where j.status = 'cancelled' and j.cancelled_by = 'provider') as cancelled_after_accept,
    coalesce(sum(j.commission_amount), 0) as commission_charged,
    coalesce(sum(j.commission_amount) filter (where j.commission_refunded_at is not null), 0) as commission_refunded,
    round(count(j.id) filter (where j.status = 'completed')::numeric
          / greatest(count(j.id), 1), 4) as completion_rate,
    round(count(j.id) filter (where j.customer_confirmed_at is not null)::numeric
          / greatest(count(j.id) filter (where j.status = 'completed'), 1), 4) as confirmation_rate
  from public.provider_profiles p
  join public.jobs j
    on j.assigned_provider_id = p.id
   and j.commission_charged_at is not null
  group by p.id, p.business_name
  having count(j.id) >= min_accepted
  order by completion_rate asc, accepted desc;
$$;

revoke all on function public.provider_integrity_report(integer) from public, anon, authenticated;
grant execute on function public.provider_integrity_report(integer) to service_role;

-- Pairs that transacted once and never came back are the normal case; pairs
-- that keep meeting through the platform are the ones the commission is for.
create or replace function public.repeat_customer_report(since timestamptz default now() - interval '180 days')
returns table (
  provider_id   uuid,
  business_name text,
  customers     bigint,
  repeat_customers bigint,
  repeat_rate   numeric
)
language sql
stable
security invoker
as $$
  with pairs as (
    select j.assigned_provider_id as provider_id,
           j.customer_id,
           count(*) as jobs
      from public.jobs j
     where j.assigned_provider_id is not null
       and j.commission_charged_at is not null
       and j.created_at >= since
     group by 1, 2
  )
  select
    p.id,
    p.business_name,
    count(*) as customers,
    count(*) filter (where pairs.jobs > 1) as repeat_customers,
    round(count(*) filter (where pairs.jobs > 1)::numeric / greatest(count(*), 1), 4) as repeat_rate
  from pairs
  join public.provider_profiles p on p.id = pairs.provider_id
  group by p.id, p.business_name
  order by customers desc;
$$;

revoke all on function public.repeat_customer_report(timestamptz) from public, anon, authenticated;
grant execute on function public.repeat_customer_report(timestamptz) to service_role;
