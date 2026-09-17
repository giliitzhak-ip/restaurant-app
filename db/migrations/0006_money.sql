-- ===========================================================================
-- 0006 — Payments, transactions, platform fees (spec §27, §28)
-- ===========================================================================

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null unique references public.jobs(id) on delete restrict,
  customer_id         uuid not null references public.customer_profiles(id) on delete restrict,
  provider_id         uuid not null references public.provider_profiles(id) on delete restrict,

  -- All amounts in agorot (integer minor units) to avoid float drift.
  gross_amount        integer not null check (gross_amount >= 0),
  platform_fee        integer not null default 0 check (platform_fee >= 0),
  provider_amount     integer not null default 0 check (provider_amount >= 0),
  refunded_amount     integer not null default 0 check (refunded_amount >= 0),
  currency            text not null default 'ILS' check (currency ~ '^[A-Z]{3}$'),

  status              payment_status not null default 'REQUIRES_AUTHORIZATION',
  provider_name       text not null,
  external_ref        text,

  authorized_at       timestamptz,
  captured_at         timestamptz,
  refunded_at         timestamptz,
  failure_code        text,
  failure_message     text,

  payout_status       payout_status not null default 'PENDING',
  payout_ref          text,
  paid_out_at         timestamptz,

  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payments_split_balances check (platform_fee + provider_amount <= gross_amount),
  constraint payments_refund_bound check (refunded_amount <= gross_amount)
);

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

create index if not exists payments_provider_idx on public.payments(provider_id, created_at desc);
create index if not exists payments_customer_idx on public.payments(customer_id, created_at desc);
create index if not exists payments_status_idx   on public.payments(status);

-- Append-only ledger of every attempt against the payment provider.
-- `idempotency_key` is UNIQUE: a retried authorize/capture/refund can never
-- be applied twice (spec §27).
create table if not exists public.payment_transactions (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments(id) on delete cascade,
  operation         text not null check (operation in ('authorize','capture','refund','partial_refund','payout','void')),
  idempotency_key   text not null unique,
  amount            integer not null check (amount >= 0),
  status            text not null check (status in ('pending','succeeded','failed')),
  external_ref      text,
  error_code        text,
  error_message     text,
  request_payload   jsonb not null default '{}'::jsonb,
  response_payload  jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists payment_transactions_payment_idx
  on public.payment_transactions(payment_id, created_at);

-- Fee configuration is data, supporting percentage / fixed / tiered /
-- category override (spec §28). Never hard-coded in application code.
create table if not exists public.platform_fees (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category_id     uuid references public.categories(id) on delete cascade,
  fee_type        text not null check (fee_type in ('percentage','fixed','tiered')),
  -- For 'tiered': [{"up_to": 100000, "percentage": 15}, {"up_to": null, "percentage": 10}]
  config          jsonb not null,
  priority        integer not null default 100,
  is_active       boolean not null default true,
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists platform_fees_touch on public.platform_fees;
create trigger platform_fees_touch before update on public.platform_fees
  for each row execute function public.touch_updated_at();

-- At most one active default (category-less) fee rule at a time.
create unique index if not exists platform_fees_one_active_default
  on public.platform_fees((category_id is null))
  where is_active and category_id is null;
