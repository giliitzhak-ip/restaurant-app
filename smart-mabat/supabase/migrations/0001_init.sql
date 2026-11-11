-- SMART MABAT AI MARKETING — initial schema
-- Run once in Supabase → SQL Editor (paste & Run).
-- All access goes through the server with the service-role key.
-- RLS is enabled with NO policies, so the public anon key cannot read or write anything.

create extension if not exists pgcrypto;

-- ───────────────────────────── settings (single row) ─────────────────────────────
create table if not exists app_settings (
  id                int primary key default 1 check (id = 1),
  agent_enabled     boolean not null default false,          -- master on/off for automatic work
  approval_mode     text    not null default 'manual'
                    check (approval_mode in ('draft', 'manual', 'auto')),
  live_publishing   boolean not null default false,          -- second switch; env PUBLISH_LIVE_ENABLED must also be true
  posts_per_week    int     not null default 7 check (posts_per_week between 1 and 21),
  publish_days      int[]   not null default '{7,1,2,3,4,5,6}', -- ISO weekday: 1=Mon … 7=Sun
  publish_times     text[]  not null default '{"19:00"}',       -- HH:MM, Israel time
  plan_ahead_days   int     not null default 3 check (plan_ahead_days between 1 and 14),
  image_mode        text    not null default 'ai' check (image_mode in ('ai', 'library', 'none')),
  image_headline    boolean not null default true,           -- Hebrew headline on the branded image
  brand_hashtags    text[]  not null default '{"#מבטחכם","#SmartMabat","#מצלמותאבטחה","#יצחקפרוייקטים"}',
  cta_text          text    not null default 'לייעוץ והצעת מחיר – שלחו לנו הודעה בדיירקט 📩',
  phone             text,
  website           text,
  service_area      text,
  logo_media_id     uuid,
  extra_instructions text,
  updated_at        timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- ───────────────────────────── instagram connection (single row) ─────────────────
create table if not exists instagram_connection (
  id                int primary key default 1 check (id = 1),
  api_host          text not null default 'instagram' check (api_host in ('instagram', 'facebook')),
  ig_user_id        text,
  username          text,
  account_type      text,
  access_token_enc  text,                 -- AES-256-GCM, key only in server env
  token_expires_at  timestamptz,
  permissions       text[] not null default '{}',
  permissions_ok    boolean not null default false,
  quota_usage       int,
  quota_total       int,
  last_verified_at  timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now()
);
insert into instagram_connection (id) values (1) on conflict (id) do nothing;

-- ───────────────────────────── media library ─────────────────────────────────────
create table if not exists media_assets (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('upload', 'ai', 'branded', 'logo')),
  storage_path  text not null unique,
  public_url    text not null,
  mime_type     text not null,
  width         int,
  height        int,
  title         text,
  tags          text[] not null default '{}',
  source_prompt text,
  parent_id     uuid references media_assets(id) on delete set null,
  use_count     int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists media_assets_kind_idx on media_assets(kind, created_at desc);

-- ───────────────────────────── posts / publishing queue ──────────────────────────
create table if not exists posts (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'draft' check (status in
                   ('draft', 'pending_approval', 'scheduled', 'publishing',
                    'published', 'simulated', 'failed', 'rejected')),
  media_type       text not null default 'IMAGE' check (media_type in ('IMAGE', 'REELS')),
  category         text,
  topic            text,
  hook             text,
  caption          text not null,
  hashtags         text[] not null default '{}',
  cta              text,
  headline         text,                 -- short Hebrew line printed on the image
  image_prompt     text,
  alt_text         text,
  media_id         uuid references media_assets(id) on delete set null,
  video_url        text,
  scheduled_at     timestamptz,
  checks           jsonb not null default '[]',
  checks_passed    boolean not null default false,
  fingerprint      text,
  attempt_count    int not null default 0,
  next_attempt_at  timestamptz,
  last_error       text,
  locked_at        timestamptz,
  ig_container_id  text,
  ig_media_id      text unique,
  ig_permalink     text,
  published_at     timestamptz,
  ai_model         text,
  created_by       text not null default 'agent' check (created_by in ('agent', 'admin')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists posts_status_sched_idx on posts(status, scheduled_at);
-- The same caption can never be queued twice (rejected posts don't count).
create unique index if not exists posts_fingerprint_uniq on posts(fingerprint)
  where status <> 'rejected' and fingerprint is not null;

create table if not exists post_insights (
  id          bigserial primary key,
  post_id     uuid not null references posts(id) on delete cascade,
  fetched_at  timestamptz not null default now(),
  reach       int,
  likes       int,
  comments    int,
  saved       int,
  shares      int,
  views       int,
  raw         jsonb
);
create index if not exists post_insights_post_idx on post_insights(post_id, fetched_at desc);

-- ───────────────────────────── logs & runs ───────────────────────────────────────
create table if not exists activity_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  level       text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  event       text not null,
  message     text not null,
  post_id     uuid,
  meta        jsonb
);
create index if not exists activity_log_created_idx on activity_log(created_at desc);
create index if not exists activity_log_event_idx on activity_log(event, created_at desc);

create table if not exists agent_runs (
  id           bigserial primary key,
  trigger      text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  summary      jsonb
);

-- A lease so that two overlapping cron calls never run the agent at the same time.
create table if not exists agent_lease (
  id            int primary key default 1 check (id = 1),
  holder        text,
  locked_until  timestamptz
);
insert into agent_lease (id) values (1) on conflict (id) do nothing;

create or replace function acquire_agent_lease(p_holder text, p_seconds int)
returns boolean language plpgsql as $$
declare ok boolean;
begin
  update agent_lease
     set holder = p_holder, locked_until = now() + make_interval(secs => p_seconds)
   where id = 1 and (locked_until is null or locked_until < now())
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function release_agent_lease(p_holder text)
returns void language sql as $$
  update agent_lease set holder = null, locked_until = null where id = 1 and holder = p_holder;
$$;

-- Atomically claim due posts so a post can never be picked up twice.
create or replace function claim_due_posts(p_limit int)
returns setof posts language sql as $$
  update posts p
     set status = 'publishing', locked_at = now(), attempt_count = p.attempt_count + 1, updated_at = now()
   where p.id in (
     select id from posts
      where status = 'scheduled'
        and checks_passed
        and scheduled_at <= now()
        and (next_attempt_at is null or next_attempt_at <= now())
      order by scheduled_at
      limit p_limit
      for update skip locked)
  returning p.*;
$$;

-- Claim one specific post (used by "publish now").
create or replace function claim_post(p_id uuid)
returns setof posts language sql as $$
  update posts p
     set status = 'publishing', locked_at = now(), attempt_count = p.attempt_count + 1, updated_at = now()
   where p.id = p_id and p.status in ('scheduled', 'failed') and p.checks_passed
  returning p.*;
$$;

-- ───────────────────────────── security: lock everything down ────────────────────
alter table app_settings          enable row level security;
alter table instagram_connection  enable row level security;
alter table media_assets          enable row level security;
alter table posts                 enable row level security;
alter table post_insights         enable row level security;
alter table activity_log          enable row level security;
alter table agent_runs            enable row level security;
alter table agent_lease           enable row level security;

revoke execute on function acquire_agent_lease(text, int) from public, anon, authenticated;
revoke execute on function release_agent_lease(text)       from public, anon, authenticated;
revoke execute on function claim_due_posts(int)            from public, anon, authenticated;
revoke execute on function claim_post(uuid)                from public, anon, authenticated;

-- ───────────────────────────── storage ───────────────────────────────────────────
-- Public-read bucket: Instagram must be able to download the image by URL.
-- Uploads only happen server-side with the service-role key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do nothing;
