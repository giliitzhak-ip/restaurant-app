-- ============================================================================
-- GET SERVICE — 0001  Extensions, enums and shared helpers
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "postgis"  with schema extensions;

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum ('customer', 'provider', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'suspended', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.provider_status as enum ('pending', 'verified', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum (
    'requested', 'searching', 'offers_received', 'provider_selected',
    'provider_on_the_way', 'arrived', 'in_progress', 'completed',
    'cancelled', 'disputed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_urgency as enum ('now', 'today', 'tomorrow', 'scheduled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'expired', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum (
    'pending', 'authorized', 'captured', 'refunded', 'failed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transaction_type as enum (
    'authorization', 'capture', 'refund', 'payout', 'platform_fee'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_status as enum ('open', 'under_review', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_reason as enum (
    'price', 'not_performed', 'damage', 'no_show', 'payment_issue', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_type as enum (
    'identity', 'professional_license', 'certificate', 'insurance',
    'business_registration', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_channel as enum ('in_app', 'push', 'sms', 'email', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_status as enum ('pending', 'sent', 'failed', 'read');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_type as enum ('text', 'image', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.actor_type as enum ('customer', 'provider', 'admin', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_kind as enum ('image', 'video');
exception when duplicate_object then null; end $$;

-- ── Shared helpers ──────────────────────────────────────────────────────────

-- Keeps `updated_at` honest without trusting any client.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
