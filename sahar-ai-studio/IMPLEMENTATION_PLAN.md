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

## Phase 3 — Provider abstraction, Mock Provider, queue, end-to-end generation ✅

- [x] Phase 2 UI/RTL audit (he/en × desktop/iPhone): `<bdi>` isolation of user content,
      `dir="auto"` inputs, timeline grips off the ruler, toolbar regrouped, wrapping buttons
- [x] Upload matrix tests (WebP, MP3 with cover art, 24-bit/48 kHz mono WAV, Hebrew
      filename, oversize client+server, HEIC/MP4 refused) and DB/S3 persistence tests
- [x] `packages/providers`: normalized capabilities, pricing with source/verification date,
      cost estimate, request validation, local vs remote execution, registry
- [x] Mock provider: real H.264/AAC MP4 via FFmpeg from the reference image + exact song
      segment, waveform strip, burned-in "technical test — not AI" labels (he + en)
- [x] Local GPU provider listed but never operational (no backend)
- [x] Approval flow: server-recomputed estimate must equal the approved amount,
      idempotency key per approval, budget check for billable providers under a per-user
      advisory lock, max 10 active jobs per user
- [x] BullMQ generation queue + worker: QUEUED → PROCESSING → COMPLETED / FAILED /
      CANCELLED with compare-and-set transitions, event history, real FFmpeg progress,
      cancellation that stops FFmpeg, output verification with ffprobe, retries for
      transient errors, permanent error codes, startup reconciliation
- [x] Takes stored privately; inline iPhone playback (`playsInline`, Range) and download
      (`Content-Disposition` with Hebrew filename); selected take in the scene editor
- [x] Studio page (scene → engine → estimate → approval → live job list) and the
      Rendering Queue page listing all generation jobs

### Phase 3 verification notes

- In-browser _playback_ of the MP4 could not be automated here: Playwright's Chromium has
  no H.264/AAC decoders. The files are verified with ffprobe (H.264 High, yuv420p, AAC-LC,
  faststart) and served with Range support; iPhone Safari and Chrome do decode H.264.
- Automated "iPhone" tests use Chromium with iPhone 14 emulation, not WebKit/Safari.

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
