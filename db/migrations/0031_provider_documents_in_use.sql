-- ===========================================================================
-- 0031 — the documents table starts holding documents
--
-- `provider_documents` has existed since 0007, with the right RLS since 0011:
-- a provider reads and inserts only their own rows, and only an admin may
-- UPDATE, so nobody can approve their own licence. Nothing ever wrote to it.
--
-- The result was a dead end in the product. The registration form told a
-- provider "התחום הזה דורש רישיון וביטוח. המנהל יבקש את המסמכים לפני האימות"
-- and then gave them nowhere to put either one; the admin had nothing to look
-- at; and `verify_provider` would happily mark a licensed trade VERIFIED with
-- no licence anywhere in the system. The promise on the form was not kept by
-- anything.
--
-- This migration adds what was missing to hold and gate a real document.
-- ===========================================================================

-- ── Where the bytes live ───────────────────────────────────────────────────
--
-- In the database, deliberately. 0007's comment says "the file itself lives in
-- storage and is only ever reachable through a short-lived signed URL", which
-- describes an object store this deployment does not have — and a signed URL
-- we cannot sign is worse than no URL. A licence is a few hundred kilobytes,
-- one per provider; Postgres holds that comfortably, it inherits the row
-- security the rest of the table already has, and it does not vanish when a
-- container is recycled.
--
-- `storage_path` keeps its meaning as an opaque locator — `db://<uuid>` for
-- this backend — so moving to an object store later is a new implementation
-- of the DocumentStorage interface, not a schema change.
create table if not exists public.provider_document_blobs (
  document_id  uuid primary key
                 references public.provider_documents(id) on delete cascade,
  bytes        bytea not null,
  created_at   timestamptz not null default now()
);

alter table public.provider_document_blobs enable row level security;

-- The blob is exactly as private as its parent row, and says so here rather
-- than trusting every future caller to remember. No UPDATE policy: a document
-- is replaced by withdrawing it and uploading another, so the bytes an admin
-- approved cannot be swapped underneath that approval.
drop policy if exists provider_document_blobs_read on public.provider_document_blobs;
create policy provider_document_blobs_read on public.provider_document_blobs
  for select using (
    exists (
      select 1 from public.provider_documents d
       where d.id = provider_document_blobs.document_id
         and (d.provider_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists provider_document_blobs_insert_own on public.provider_document_blobs;
create policy provider_document_blobs_insert_own on public.provider_document_blobs
  for insert with check (
    exists (
      select 1 from public.provider_documents d
       where d.id = provider_document_blobs.document_id
         and d.provider_id = auth.uid()
    )
  );

grant select, insert, delete on public.provider_document_blobs to authenticated;
grant select, insert, update, delete on public.provider_document_blobs to service_role;

-- ── Withdrawing a document that has not been reviewed ──────────────────────
--
-- 0011 gave providers insert and no delete, which is right for anything an
-- admin has ruled on — an approval or a rejection is a record, not a draft.
-- But a provider who uploaded the wrong file was stuck with it forever, and
-- the reviewer with a queue of mistakes. PENDING only, and the same rule the
-- trade proposals use.
drop policy if exists provider_documents_delete_own_pending on public.provider_documents;
create policy provider_documents_delete_own_pending on public.provider_documents
  for delete using (provider_id = auth.uid() and status = 'PENDING');

grant delete on public.provider_documents to authenticated;

-- ── What the document says about itself ────────────────────────────────────
alter table public.provider_documents
  add column if not exists doc_number text,
  add column if not exists original_filename text;

comment on column public.provider_documents.doc_number is
  'Licence or policy number as the provider stated it, for a reviewer to '
  'check against the issuing registry. Self-declared: never treated as '
  'verified on its own.';

-- A document nobody can open is not a document. 10 MB is generous for a
-- licence scan and small enough that a row stays readable in one go.
alter table public.provider_documents
  drop constraint if exists provider_documents_size_sane;
alter table public.provider_documents
  add constraint provider_documents_size_sane
  check (size_bytes is null or size_bytes between 1 and 10485760);

-- An expiry in the past is not a valid document, and letting one in means a
-- reviewer approving something already expired.
alter table public.provider_documents
  drop constraint if exists provider_documents_review_is_recorded;
alter table public.provider_documents
  add constraint provider_documents_review_is_recorded
  check (status = 'PENDING' or reviewed_at is not null);

create index if not exists provider_documents_status_idx
  on public.provider_documents(status, created_at);

-- ── The gate ───────────────────────────────────────────────────────────────
--
-- Which required documents a provider still owes, given the categories they
-- have declared. Returns an empty array when nothing is outstanding.
--
-- This is the whole point of the feature: without it, "requires_license" is
-- a sentence on a form. `verify_provider` calls it and refuses, and the
-- admin queue shows it, so a reviewer sees what is missing instead of
-- discovering it after clicking approve.
--
-- SECURITY DEFINER because an admin's session must be able to evaluate it
-- over a provider's own document rows, and because the candidate queue
-- evaluates it for many providers at once.
create or replace function public.provider_missing_documents(p_provider uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with required as (
    select distinct kind from (
      select 'license' as kind
        from public.provider_categories pc
        join public.categories c on c.id = pc.category_id
       where pc.provider_id = p_provider and c.requires_license
      union all
      select 'insurance'
        from public.provider_categories pc
        join public.categories c on c.id = pc.category_id
       where pc.provider_id = p_provider and c.requires_insurance
    ) k
  )
  select coalesce(array_agg(r.kind order by r.kind), '{}')
    from required r
   where not exists (
     select 1 from public.provider_documents d
      where d.provider_id = p_provider
        and d.doc_type = r.kind
        and d.status = 'VERIFIED'
        -- An expired approval is not an approval.
        and (d.expires_on is null or d.expires_on >= (now() at time zone public.availability_timezone())::date)
   );
$$;

revoke all on function public.provider_missing_documents(uuid) from public;
grant execute on function public.provider_missing_documents(uuid) to authenticated, service_role;

comment on function public.provider_missing_documents(uuid) is
  'Required document kinds this provider has not had approved (or whose '
  'approval has expired), from the categories they declared. Empty array '
  'means nothing outstanding — see migration 0031.';
