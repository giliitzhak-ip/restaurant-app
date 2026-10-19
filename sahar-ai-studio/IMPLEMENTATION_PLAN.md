# SAHAR AI STUDIO — Implementation Plan

Status legend: ✅ done · 🔜 next · ⏳ planned

## Phase 1 — Foundation ✅

- [x] pnpm/TypeScript monorepo (`apps/web`, `apps/worker`, `packages/db`, `packages/shared`)
- [x] Strict TypeScript, ESLint 9 flat config, Vitest, Playwright
- [x] Docker Compose: PostgreSQL 16, Redis 7, SeaweedFS S3 (+ private bucket init), web, worker
- [x] Full Prisma schema for the MVP domain + initial migration
- [x] Environment validation (zod) shared by web and worker; `.env.example`
- [x] Authentication: registration (with usage-rights acceptance), login, logout,
      DB-backed hashed sessions, scrypt passwords, Redis rate limiting, audit log
- [x] Route protection (middleware + server-side `requireUser`)
- [x] Hebrew-first RTL layout, dark/gold design system, responsive desktop + iPhone
      navigation, all nine pages routed
- [x] Language switch Hebrew ⇄ English (persisted per user)
- [x] Settings: account info, language, server-side provider configuration status
- [x] Dashboard with live DB/Redis health and real counts
- [x] Worker: BullMQ maintenance queue that purges expired sessions (repeatable job)
- [x] `/api/health` endpoint; structured logging; security headers
- [x] Backup & recovery documentation

### Phase 1 verification notes

- Verified: typecheck, lint, Prettier, 32 unit tests, 10 PostgreSQL/Redis integration
  tests, production build, 13 Playwright e2e tests (desktop + iPhone 14 viewport), live
  worker executing the session-purge job, SeaweedFS private bucket (signed access OK,
  anonymous/wrong-key access denied), `pg_dump` backup command.
- Not yet verified: building the `web`/`worker` Docker images — the development sandbox
  used for Phase 1 had no outbound network inside build containers. Run
  `docker compose --profile app up -d --build` once on a normal machine.

## Phase 2 — Characters, uploads, projects, waveform ✅

- [x] `packages/storage` (S3: streamed multipart upload, ranged reads, deletes)
- [x] Upload route streaming to private storage: consent + CSRF + ownership checks,
      magic-byte sniffing before storing, size cap and SHA-256 while streaming
- [x] Authorized media route with HTTP Range (iOS Safari playback)
- [x] `ConsentRecord` for every song (music rights) and reference image (likeness)
- [x] Character library: create/edit/delete, reference images (upload, primary, delete),
      clothing and style presets, generation history (empty until Phase 3)
- [x] **Sharona Sahar** preset in every library as the main character — no invented photo
- [x] Projects: create/edit/delete, aspect ratio 16:9 / 9:16 with output size, main
      character, song upload with real progress, song replacement
- [x] Worker media queue: image verification; audio analysis (duration, sample rate,
      channels, codec, bitrate, waveform, silences, tempo + beats with confidence)
- [x] Automatic scene proposal (silences, beats, length bounds) on first analysis
- [x] Interactive canvas timeline: playback, seek, zoom, drag boundaries (mouse, touch,
      keyboard), split, merge, re-propose, save with stale/takes protection
- [x] Scene editor: per-scene character, reference image and prompt; identity warning;
      "apply main character to all scenes"
- [x] Hebrew RTL + iPhone layout for every new screen
- Moved to Phase 5: lyrics entry and lyric-assisted timing (not needed before takes exist)

### Phase 2 verification notes

- Tempo detection is validated on synthetic signals only. Real Hebrew songs should be
  run through it (and through lip-sync in Phase 3/4) before trusting BPM values.
- Touch dragging was tested with Chromium's iPhone emulation (pointer events); it has not
  been tested on a physical iPhone in this environment.

## Phase 3 — Provider abstraction, Mock Provider, queue, end-to-end generation ⏳

- `packages/providers`: interface, capability schema, registry, cost-estimate types
- Mock provider that actually produces a video with FFmpeg (still image + audio segment,
  subtle motion) — free, honest about being a mock
- Cost estimate → explicit approval → `GenerationJob` → BullMQ → worker submit/poll →
  result stored → `Take` created; idempotency + compare-and-set transitions
- Monthly budget enforcement at approval time
- Rendering Queue / AI Singing Studio pages wired to real job state (polling/SSE)
- Tests: full flow e2e with the mock provider; duplicate-submission prevention

## Phase 4 — Hedra integration ⏳

- Read current official Hedra API docs; record verified endpoints, limits and pricing
- Adapter: asset upload, generation submit, status polling, result download, cancel
- Webhook support only if documented, with signature verification
- Real Hebrew singing test samples (with user approval for each paid run)

## Phase 5 — Scene editor, timeline, FFmpeg export ⏳

- Timeline with audio + video tracks, reorder/trim/replace, take history, preview
- Manual per-scene offset correction; A/B take comparison
- Render job: normalize (scale+pad, CFR), concat, mux original song, H.264/AAC MP4,
  16:9 or 9:16, 1080p when sources allow; real progress from `-progress`
- Tests: A/V sync validation on rendered output with ffprobe (stream durations, PTS)

## Phase 6 — fal.ai lip-sync correction & regeneration ⏳

- Verified fal.ai lip-sync adapter (queue API, webhooks if supported)
- Lip-sync correction on existing takes; per-scene regeneration keeping history
- Per-scene / per-project spending report including actual billed amounts

## Phase 7 — Automation, quality evaluation, local GPU ⏳

- Automatic storyboard/prompt assistance
- Lip-sync quality measurement only with a validated method (e.g. SyncNet-style
  confidence calibrated on labelled samples); until then no quality scores are shown
- Local GPU provider backed by a real inference server; marked operational only after
  tested end-to-end

## Cross-cutting backlog

- i18n: additional strings per phase in both dictionaries
- Observability: request IDs, job metrics
- Production deployment guide (only on explicit approval)
