-- ===========================================================================
-- 0007 — Reviews, documents, disputes, messages, notifications
-- ===========================================================================

-- Two-sided reviews (spec §30). Only a participant of a completed job may
-- review, and only once per direction — enforced here and in RLS.
create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  author_id      uuid not null references public.profiles(id) on delete cascade,
  subject_id     uuid not null references public.profiles(id) on delete cascade,
  direction      text not null check (direction in ('customer_to_provider','provider_to_customer')),
  rating         integer not null check (rating between 1 and 5),
  comment        text check (comment is null or length(comment) <= 2000),
  -- Optional sub-scores, customer -> provider only.
  punctuality    integer check (punctuality is null or punctuality between 1 and 5),
  professionalism integer check (professionalism is null or professionalism between 1 and 5),
  value_score    integer check (value_score is null or value_score between 1 and 5),
  created_at     timestamptz not null default now(),
  unique (job_id, direction),
  constraint reviews_no_self_review check (author_id <> subject_id)
);

create index if not exists reviews_subject_idx on public.reviews(subject_id, created_at desc);

-- Private provider documents (spec §31). The file itself lives in storage and
-- is only ever reachable through a short-lived signed URL.
create table if not exists public.provider_documents (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.provider_profiles(id) on delete cascade,
  doc_type       text not null check (doc_type in ('identity','license','insurance','business_registration','payout','other')),
  storage_path   text not null,
  content_type   text,
  size_bytes     bigint check (size_bytes is null or size_bytes >= 0),
  status         verification_status not null default 'PENDING',
  expires_on     date,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  review_notes   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists provider_documents_touch on public.provider_documents;
create trigger provider_documents_touch before update on public.provider_documents
  for each row execute function public.touch_updated_at();

create index if not exists provider_documents_provider_idx
  on public.provider_documents(provider_id);

create table if not exists public.disputes (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  opened_by      uuid not null references public.profiles(id) on delete restrict,
  reason         text not null check (length(btrim(reason)) between 3 and 2000),
  status         dispute_status not null default 'OPEN',
  resolution     text,
  resolved_by    uuid references public.profiles(id) on delete set null,
  resolved_at    timestamptz,
  refund_amount  integer check (refund_amount is null or refund_amount >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists disputes_touch on public.disputes;
create trigger disputes_touch before update on public.disputes
  for each row execute function public.touch_updated_at();

create index if not exists disputes_status_idx on public.disputes(status, created_at desc);
create index if not exists disputes_job_idx on public.disputes(job_id);

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  body         text not null check (length(btrim(body)) between 1 and 2000),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists messages_job_idx on public.messages(job_id, created_at);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  job_id       uuid references public.jobs(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  payload      jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(user_id) where read_at is null;
