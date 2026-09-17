-- ============================================================================
-- GET SERVICE — 0004  Payments, reviews, disputes, notifications, settings
-- ============================================================================

-- ── Payments ────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null unique references public.jobs (id) on delete cascade,
  customer_id           uuid not null references public.users (id) on delete restrict,
  provider_id           uuid not null references public.provider_profiles (id) on delete restrict,
  amount                numeric(10, 2) not null check (amount > 0),
  platform_fee          numeric(10, 2) not null default 0 check (platform_fee >= 0),
  provider_payout       numeric(10, 2) not null default 0 check (provider_payout >= 0),
  currency              text not null default 'ILS',
  status                public.payment_status not null default 'pending',
  provider_name         text not null default 'mock',
  external_id           text,
  fee_rule_snapshot     jsonb not null default '{}'::jsonb,
  authorized_at         timestamptz,
  captured_at           timestamptz,
  refunded_at           timestamptz,
  failure_reason        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint payments_split_balances check (round(platform_fee + provider_payout, 2) = round(amount, 2))
);
comment on column public.payments.fee_rule_snapshot is
  'The fee rule that was in force when the payment was created — keeps historical splits auditable after settings change.';

create table if not exists public.payment_transactions (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments (id) on delete cascade,
  type           public.transaction_type not null,
  amount         numeric(10, 2) not null,
  currency       text not null default 'ILS',
  status         public.payment_status not null default 'pending',
  external_id    text,
  raw_response   jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create table if not exists public.platform_fees (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments (id) on delete cascade,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  amount         numeric(10, 2) not null check (amount >= 0),
  rate           numeric(6, 4) not null,
  rule_label     text,
  created_at     timestamptz not null default now()
);

-- ── Reviews ─────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null unique references public.jobs (id) on delete cascade,
  customer_id    uuid not null references public.users (id) on delete cascade,
  provider_id    uuid not null references public.provider_profiles (id) on delete cascade,
  rating         numeric(2, 1) not null check (rating >= 1 and rating <= 5),
  comment        text,
  is_hidden      boolean not null default false,
  hidden_reason  text,
  hidden_by      uuid references public.users (id) on delete set null,
  flagged        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.reviews is
  'Immutable from the provider side. Only an admin may hide a review (moderation), nobody may delete one.';

create table if not exists public.review_categories (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews (id) on delete cascade,
  criterion   text not null check (criterion in ('professionalism', 'price', 'punctuality', 'service')),
  score       integer not null check (score between 1 and 5),
  created_at  timestamptz not null default now(),
  unique (review_id, criterion)
);

-- ── Disputes ────────────────────────────────────────────────────────────────
create table if not exists public.disputes (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs (id) on delete cascade,
  opened_by      uuid not null references public.users (id) on delete cascade,
  opened_by_type public.actor_type not null,
  reason         public.dispute_reason not null,
  description    text not null,
  status         public.dispute_status not null default 'open',
  resolution     text,
  resolved_by    uuid references public.users (id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Notifications ───────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  event        text not null,
  title        text not null,
  body         text not null,
  channel      public.notification_channel not null default 'in_app',
  status       public.notification_status not null default 'pending',
  job_id       uuid references public.jobs (id) on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  error        text,
  sent_at      timestamptz,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ── Admin & settings ────────────────────────────────────────────────────────
create table if not exists public.settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.users (id) on delete cascade,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_payments_status       on public.payments (status);
create index if not exists idx_payments_provider     on public.payments (provider_id, created_at desc);
create index if not exists idx_payments_customer     on public.payments (customer_id, created_at desc);
create index if not exists idx_payment_tx_payment    on public.payment_transactions (payment_id, created_at);
create index if not exists idx_platform_fees_job     on public.platform_fees (job_id);
create index if not exists idx_reviews_provider      on public.reviews (provider_id, created_at desc);
create index if not exists idx_reviews_visible       on public.reviews (provider_id) where not is_hidden;
create index if not exists idx_review_categories_rev on public.review_categories (review_id);
create index if not exists idx_disputes_status       on public.disputes (status, created_at desc);
create index if not exists idx_disputes_job          on public.disputes (job_id);
create index if not exists idx_notifications_user    on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread  on public.notifications (user_id) where read_at is null;
create index if not exists idx_admin_actions_admin   on public.admin_actions (admin_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['payments', 'reviews', 'disputes', 'settings'] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;
