-- ===========================================================================
-- 0034 — before/after photos, which the schema has promised since 0004
--
-- `job_images` shipped in migration 0004 with a `kind` of
-- problem/before/after/receipt, and the right row security in 0011:
-- participants read, the uploader inserts. Nothing ever wrote to it.
--
-- Meanwhile `categories.requires_before_after` is set on real categories and
-- is sent to both the customer's job screen and the provider's offer — so the
-- platform tells both sides that this kind of work is documented with photos,
-- and there was no way to take one, nowhere for it to go, and nothing
-- checking. Exactly the shape of the licence problem: a schema that describes
-- a feature, a UI that mentions it, and no code in between.
--
-- Photos matter for the same reason the licence does. They are the evidence
-- in a dispute — `disputes` exists for when a customer says the work was not
-- done — and a platform that asked for them and then accepted a completion
-- without them would be holding an empty file when it mattered.
-- ===========================================================================

-- Bytes beside the row, for the reasons set out in 0031: there is no object
-- store in this deployment, the blob inherits the parent's row security, and
-- it commits in the same transaction as the row that describes it.
create table if not exists public.job_image_blobs (
  image_id   uuid primary key references public.job_images(id) on delete cascade,
  bytes      bytea not null,
  created_at timestamptz not null default now()
);

alter table public.job_image_blobs enable row level security;

-- As private as its parent row, stated here rather than trusted to every
-- future caller. No UPDATE policy: a photo is replaced by deleting it and
-- taking another, so the picture a customer approved cannot be swapped
-- underneath that approval.
drop policy if exists job_image_blobs_read on public.job_image_blobs;
create policy job_image_blobs_read on public.job_image_blobs
  for select using (
    exists (
      select 1 from public.job_images i
       where i.id = job_image_blobs.image_id
         and (public.is_job_participant(i.job_id) or public.is_admin())
    )
  );

drop policy if exists job_image_blobs_insert on public.job_image_blobs;
create policy job_image_blobs_insert on public.job_image_blobs
  for insert with check (
    exists (
      select 1 from public.job_images i
       where i.id = job_image_blobs.image_id
         and i.uploaded_by = auth.uid()
         and public.is_job_participant(i.job_id)
    )
  );

grant select, insert, delete on public.job_image_blobs to authenticated;
grant select, insert, update, delete on public.job_image_blobs to service_role;

-- ── Removing a photo you took, before the job is closed ────────────────────
--
-- 0011 gave participants insert and no delete. A provider who photographed
-- the wrong wall was stuck with it in the customer's evidence, so the same
-- rule the documents use: your own, and only while the job is still open.
drop policy if exists job_images_delete_own on public.job_images;
create policy job_images_delete_own on public.job_images
  for delete using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.jobs j
       where j.id = job_images.job_id
         and j.status not in ('COMPLETED','PAID','REVIEWED',
                              'CANCELLED_BY_CUSTOMER','CANCELLED_BY_PROVIDER',
                              'CANCELLED_BY_SYSTEM')
    )
  );

grant delete on public.job_images to authenticated;

alter table public.job_images
  drop constraint if exists job_images_size_sane;
alter table public.job_images
  add constraint job_images_size_sane
  check (size_bytes is null or size_bytes between 1 and 10485760);

create index if not exists job_images_kind_idx on public.job_images(job_id, kind);

-- ── The gate ───────────────────────────────────────────────────────────────
--
-- Which required photo kinds a job is still missing. Empty when the category
-- does not ask for them, or when both are there.
--
-- One function, so the provider's screen and the transition that refuses read
-- the same answer — the lesson from provider_missing_documents, where having
-- the queue and the gate agree is what stops a screen saying "ready" about
-- something the action then rejects.
create or replace function public.job_missing_images(p_job uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with required as (
    select unnest(array['before','after']) as kind
      from public.jobs j
      join public.categories c on c.id = j.category_id
     where j.id = p_job and c.requires_before_after
  )
  select coalesce(array_agg(r.kind order by r.kind), '{}')
    from required r
   where not exists (
     select 1 from public.job_images i
      where i.job_id = p_job and i.kind = r.kind
   );
$$;

revoke all on function public.job_missing_images(uuid) from public;
grant execute on function public.job_missing_images(uuid) to authenticated, service_role;

comment on function public.job_missing_images(uuid) is
  'Required before/after photo kinds this job has not got. Empty array means '
  'nothing outstanding — see migration 0034.';
