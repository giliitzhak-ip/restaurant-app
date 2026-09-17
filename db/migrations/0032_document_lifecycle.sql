-- ===========================================================================
-- 0032 — a document has a life after approval
--
-- Migration 0031 gated verification on approved documents, and that gate runs
-- at the moment an admin clicks verify. Nothing looked at a document again
-- afterwards, so a provider verified today with a licence expiring next month
-- stayed VERIFIED for ever and kept receiving work on a licence that no
-- longer existed. The gate was a door with no lock behind it.
--
-- Three things are needed, and only one of them is a schema change.
-- ===========================================================================

-- ── Warning without spamming ────────────────────────────────────────────────
--
-- A maintenance tick runs every half minute, so "tell the provider their
-- licence expires soon" needs somewhere to record that we already have.
alter table public.provider_documents
  add column if not exists expiry_warning_sent_at timestamptz;

comment on column public.provider_documents.expiry_warning_sent_at is
  'When the provider was last warned that this document is about to expire. '
  'Bounds the warnings to roughly one a week — see migration 0032.';

create index if not exists provider_documents_expiry_idx
  on public.provider_documents (expires_on)
  where status = 'VERIFIED' and expires_on is not null;

-- ── Whose paperwork has actually lapsed ────────────────────────────────────
--
-- Deliberately NOT "whose provider_missing_documents is non-empty". Most of
-- the synthetic network has never had a document at all — the seeder does not
-- fabricate licences — so that condition would un-verify 700 demo providers
-- the first time the sweep ran, which is a demo network destroyed by a
-- correctness fix.
--
-- The precise condition is narrower and is the one that matters: a document
-- that WAS approved, for a kind this provider's categories require, whose
-- date has passed. Somebody who never had papers is a question for the
-- verification queue; somebody whose papers ran out is a provider who must
-- stop receiving work today.
create or replace function public.providers_with_lapsed_documents()
returns table (provider_id uuid, kinds text[])
language sql
stable
security definer
set search_path = public
as $$
  select d.provider_id,
         array_agg(distinct d.doc_type order by d.doc_type) as kinds
    from public.provider_documents d
    join public.provider_profiles pp on pp.id = d.provider_id
   where pp.verification = 'VERIFIED'
     and d.status = 'VERIFIED'
     and d.expires_on is not null
     and d.expires_on < (now() at time zone public.availability_timezone())::date
     -- Only a kind they are actually required to hold. An expired
     -- business_registration does not stop a locksmith opening a door.
     and exists (
       select 1
         from public.provider_categories pc
         join public.categories c on c.id = pc.category_id
        where pc.provider_id = d.provider_id
          and ((d.doc_type = 'license' and c.requires_license)
            or (d.doc_type = 'insurance' and c.requires_insurance))
     )
     -- And not already replaced by a newer approval that is still valid.
     and not exists (
       select 1 from public.provider_documents newer
        where newer.provider_id = d.provider_id
          and newer.doc_type = d.doc_type
          and newer.status = 'VERIFIED'
          and (newer.expires_on is null
               or newer.expires_on >= (now() at time zone public.availability_timezone())::date)
     )
   group by d.provider_id;
$$;

revoke all on function public.providers_with_lapsed_documents() from public;
grant execute on function public.providers_with_lapsed_documents() to service_role;

comment on function public.providers_with_lapsed_documents() is
  'Verified providers whose required licence or insurance approval has '
  'expired with nothing valid replacing it — see migration 0032.';

-- ── Which approvals are about to lapse ─────────────────────────────────────
create or replace function public.documents_expiring_within(p_days integer)
returns table (
  document_id uuid,
  provider_id uuid,
  doc_type text,
  expires_on date
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.provider_id, d.doc_type, d.expires_on
    from public.provider_documents d
    join public.provider_profiles pp on pp.id = d.provider_id
   where d.status = 'VERIFIED'
     and d.expires_on is not null
     and d.expires_on >= (now() at time zone public.availability_timezone())::date
     and d.expires_on <= (now() at time zone public.availability_timezone())::date
                         + make_interval(days => p_days)
     -- At most one warning a week, however often the tick runs.
     and (d.expiry_warning_sent_at is null
          or d.expiry_warning_sent_at < now() - interval '7 days')
     and pp.verification = 'VERIFIED';
$$;

revoke all on function public.documents_expiring_within(integer) from public;
grant execute on function public.documents_expiring_within(integer) to service_role;

-- ── Retention ──────────────────────────────────────────────────────────────
--
-- These are identity papers. Keeping a rejected licence scan for ever is a
-- liability with no purpose: the decision is recorded in admin_actions, which
-- is the part worth keeping, and the file itself is not evidence of anything
-- after the provider has been told why it was refused.
--
-- The row survives with its reason and its review; only the bytes go. So the
-- reviewer's history stays readable and the file stops existing.
create or replace function public.purge_expired_document_blobs(p_days integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  with gone as (
    delete from public.provider_document_blobs b
     using public.provider_documents d
     where d.id = b.document_id
       and d.status = 'REJECTED'
       and d.reviewed_at < now() - make_interval(days => p_days)
    returning b.document_id
  )
  select count(*) into removed from gone;

  -- The row now describes a file that is gone. Say so rather than leaving a
  -- locator that resolves to nothing.
  update public.provider_documents
     set storage_path = '', size_bytes = null
   where status = 'REJECTED'
     and storage_path <> ''
     and not exists (
       select 1 from public.provider_document_blobs b where b.document_id = provider_documents.id
     );

  return removed;
end;
$$;

revoke all on function public.purge_expired_document_blobs(integer) from public;
grant execute on function public.purge_expired_document_blobs(integer) to service_role;

comment on function public.purge_expired_document_blobs(integer) is
  'Deletes the bytes of rejected documents older than p_days, keeping the row '
  'and the review that explains it — see migration 0032.';

-- ── The guard has to let the platform through ──────────────────────────────
--
-- `guard_provider_verification` refuses any change to `verification` unless
-- `is_admin()`. That is correct and it is the reason a provider cannot verify
-- themselves — but it also blocked the platform from UN-verifying a provider
-- whose licence expired, which is the one verification change no human should
-- have to remember to make. The sweep failed silently behind the maintenance
-- tick's error isolation, reporting zero lapsed providers.
--
-- The exemption is `service_role`, which is the platform's own role: it
-- already holds BYPASSRLS, so this grants it nothing it could not do by other
-- means, and it stays firmly shut for `authenticated` — which is the role a
-- provider's session actually runs as, and the only one the guard was ever
-- protecting against.
create or replace function public.guard_provider_verification()
returns trigger
language plpgsql
as $$
begin
  if new.verification <> old.verification
     and not public.is_admin()
     and current_user <> 'service_role' then
    raise exception 'VERIFICATION_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_provider_verification() is
  'A provider may not change their own verification. An admin may, and so may '
  'the platform itself (service_role) — see migration 0032.';
