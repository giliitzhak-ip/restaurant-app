-- ===========================================================================
-- 0001 — Extensions, enums, shared helpers
-- ===========================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ── Enums ──────────────────────────────────────────────────────────────────
-- Job lifecycle (spec §20). The canonical list; the TypeScript state machine
-- in src/domains/jobs/state-machine.ts is asserted against this enum by test.
do $$ begin
  create type job_status as enum (
    'REQUESTED',
    'SEARCHING',
    'OFFERS_AVAILABLE',
    'PROVIDER_SELECTED',
    'CONFIRMED',
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'AWAITING_CUSTOMER_CONFIRMATION',
    'COMPLETED',
    'PAID',
    'REVIEWED',
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_PROVIDER',
    'CANCELLED_BY_SYSTEM',
    'DISPUTED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_mode as enum ('NOW', 'SCHEDULE', 'COMPARE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('customer', 'provider', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type provider_state as enum ('OFFLINE', 'ONLINE', 'BUSY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type offer_status as enum ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type price_model as enum ('FIXED_PRICE', 'QUOTE', 'CUSTOM', 'OPPORTUNITY_PRICE', 'DYNAMIC');
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgency_level as enum ('low', 'normal', 'high', 'emergency');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum (
    'REQUIRES_AUTHORIZATION', 'AUTHORIZED', 'CAPTURED',
    'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payout_status as enum ('PENDING', 'PROCESSING', 'PAID', 'FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');
exception when duplicate_object then null; end $$;

-- ── Shared helpers ─────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
