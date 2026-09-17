-- ===========================================================================
-- 0025 — A provider can propose their own trade; an admin decides
--
-- The catalog ships with 7 categories and 23 services, which does not cover
-- the trades people actually do. A provider whose work is absent had no way
-- in at all: the candidate search INNER JOINs provider_categories, so no
-- declared trade means absent from every search, permanently.
--
-- So: free text, held as a PROPOSAL, with no effect on matching until an
-- admin resolves it.
--
-- Two design decisions worth stating, because both were tempting to get
-- wrong.
--
-- 1. An approved proposal becomes a SERVICE under an EXISTING category, not a
--    new category. jobs.category_id is what drives find_candidate_providers,
--    and a category carries behaviour configuration — which booking modes it
--    supports, its default radius and duration, whether it needs a licence or
--    insurance. A category invented per proposal would arrive with none of
--    that and no customers, so it would be a category nobody is ever matched
--    into.
--
-- 2. Approval MUST carry trigger phrases, or it is a fake approval. The
--    classifier routes a customer's description to a service by matching
--    phrases, and those phrases were hard-coded in TypeScript. A service
--    created without them can never be reached by any description: the
--    provider would be told "approved" and still never receive a job — the
--    same invisible-provider failure this table exists to fix, one layer up.
--    Hence services.strong_phrases / weak_phrases, which the classifier
--    merges with its built-in rules.
-- ===========================================================================

do $$ begin
  create type proposal_status as enum ('PENDING', 'APPROVED', 'REJECTED');
exception
  when duplicate_object then null;
end $$;

-- ── Trigger phrases, in data rather than in code ──────────────────────────
-- Additive: the built-in TypeScript rules still apply, and these extend them.
-- `strong` phrases are decisive on their own; `weak` phrases only support.
alter table public.services
  add column if not exists strong_phrases text[] not null default '{}',
  add column if not exists weak_phrases   text[] not null default '{}';

comment on column public.services.strong_phrases is
  'Customer phrasings that decisively indicate this service. Read by the classifier and merged with its built-in rules.';
comment on column public.services.weak_phrases is
  'Supporting phrasings. Never decisive alone.';

-- Lets the classifier load only the services that have anything to add.
create index if not exists services_with_phrases_idx
  on public.services (category_id)
  where cardinality(strong_phrases) > 0 or cardinality(weak_phrases) > 0;

-- ── The proposals themselves ──────────────────────────────────────────────
create table if not exists public.trade_proposals (
  id                   uuid primary key default gen_random_uuid(),
  provider_id          uuid not null references public.provider_profiles(id) on delete cascade,

  -- What the provider wrote, in their own words.
  proposed_name        text not null check (length(btrim(proposed_name)) between 2 and 80),
  description          text check (description is null or length(description) <= 500),
  -- What they would charge. Collected up front so approval is one decision
  -- and the provider is usable the moment it lands.
  price_ils            numeric(10,2) check (price_ils is null or (price_ils >= 0 and price_ils <= 100000)),
  -- The category the PROVIDER thinks it belongs to. A hint for the reviewer,
  -- never authoritative — the admin decides.
  suggested_category_id uuid references public.categories(id) on delete set null,

  status               proposal_status not null default 'PENDING',

  -- Filled in by the admin on resolution.
  reviewed_by          uuid references public.profiles(id) on delete set null,
  reviewed_at          timestamptz,
  review_note          text check (review_note is null or length(review_note) <= 500),
  resolved_service_id  uuid references public.services(id) on delete set null,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- A resolved proposal must say who resolved it and when; a pending one must
  -- not pretend to have been reviewed.
  constraint trade_proposals_resolution_complete check (
    (status = 'PENDING' and reviewed_by is null and reviewed_at is null)
    or (status <> 'PENDING' and reviewed_by is not null and reviewed_at is not null)
  ),
  -- An approval has to have produced something.
  constraint trade_proposals_approved_has_service check (
    status <> 'APPROVED' or resolved_service_id is not null
  )
);

-- One live proposal per trade per provider: re-submitting the same words is
-- not new information, and without this the review queue is spammable.
create unique index if not exists trade_proposals_unique_pending
  on public.trade_proposals (provider_id, lower(btrim(proposed_name)))
  where status = 'PENDING';

create index if not exists trade_proposals_queue_idx
  on public.trade_proposals (created_at)
  where status = 'PENDING';

create index if not exists trade_proposals_provider_idx
  on public.trade_proposals (provider_id, created_at desc);

drop trigger if exists trade_proposals_touch on public.trade_proposals;
create trigger trade_proposals_touch
  before update on public.trade_proposals
  for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.trade_proposals enable row level security;

-- A provider reads their own proposals, and creates them for themselves only.
drop policy if exists trade_proposals_own_read on public.trade_proposals;
create policy trade_proposals_own_read on public.trade_proposals
  for select using (provider_id = auth.uid() or public.is_admin());

drop policy if exists trade_proposals_own_insert on public.trade_proposals;
create policy trade_proposals_own_insert on public.trade_proposals
  for insert with check (
    provider_id = auth.uid()
    -- A provider cannot file a pre-approved proposal for themselves. The
    -- whole point of the table is that status is not theirs to set.
    and status = 'PENDING'
    and reviewed_by is null
    and reviewed_at is null
    and resolved_service_id is null
  );

-- Withdrawing is allowed while it is still pending; deleting the record of a
-- decision is not.
drop policy if exists trade_proposals_own_withdraw on public.trade_proposals;
create policy trade_proposals_own_withdraw on public.trade_proposals
  for delete using (
    (provider_id = auth.uid() and status = 'PENDING') or public.is_admin()
  );

-- Only an admin resolves a proposal. Deliberately NO update policy for the
-- owning provider: there is nothing on this row they may change, and an
-- UPDATE policy scoped to "their own row" would let them write their own
-- APPROVED status.
drop policy if exists trade_proposals_admin_update on public.trade_proposals;
create policy trade_proposals_admin_update on public.trade_proposals
  for update using (public.is_admin()) with check (public.is_admin());

grant select, insert, delete on public.trade_proposals to authenticated;
grant update on public.trade_proposals to authenticated;  -- narrowed by RLS to admins
grant select, insert, update, delete on public.trade_proposals to service_role;
