# Implementation plan

Each phase ends with: tests passing, a production build, a manual check at iPhone size, and **user approval before the next phase starts**.

## Phase 1: Foundation ✅
- [x] Next.js 15 + React 19 + TypeScript + Tailwind 4 + shadcn-style components
- [x] Hebrew RTL, black/gold/dark-grey theme, Heebo font, iPhone safe areas, bottom tab bar, 16px inputs (no Safari zoom)
- [x] PostgreSQL + Prisma: full schema and initial migration
- [x] Auth: register (with terms + consent acceptance), login, logout, sessions (hashed tokens), rate limiting, CSRF origin check
- [x] Account page with permanent data deletion
- [x] Provider architecture: contracts, registry with honest readiness, mock voice adapter
- [x] System status page: DB, Redis, FFmpeg/FFprobe, S3 config, per-module provider state
- [x] Terms & consent policy page, AI-content disclosure on every page
- [x] Unit tests (vitest), lint, typecheck, production build; docker-compose for Postgres/Redis/MinIO

## Phase 2: Uploads, projects, preview ✅
- [x] Storage abstraction with an S3 driver (AWS S3 / R2 / MinIO), tested against a real MinIO, plus a local-disk driver
- [x] Streaming upload API with type allow-list, per-type size limits, per-user storage quota, SHA-256, upload rate limit
- [x] Upload UI: iPhone photo/video picker and desktop drag & drop, multiple files, real byte progress, Hebrew errors
- [x] BullMQ media worker (`npm run worker`): FFprobe validation, H.264/AAC preview, poster, image/audio previews, real processing progress, retries, recovery of lost jobs, heartbeat
- [x] Private file streaming with HTTP Range (Safari), download of originals
- [x] Project library: create, edit (name/description/aspect ratio), list with covers and counts, duplicate (copies stored files), delete (rows + storage purge), per-file delete, history panel
- [x] Account deletion also purges stored files
- [x] Status page: storage and worker checks
- [x] Tests: 33 unit/integration (real FFmpeg/FFprobe, S3 against MinIO) + 4 E2E (iPhone and desktop profiles)

Decision: uploads go **through the app server** (streamed to storage), not straight to S3 with pre-signed URLs. Direct-to-S3 needs the bucket's public endpoint and CORS to be reachable from the phone, which breaks simple LAN setups. The trade-off is server bandwidth, and we can switch to pre-signed multipart uploads behind the same UI when deploying to the cloud.

Known limitations:
- EXIF orientation of JPEG *thumbnails* may be ignored by FFmpeg 6.1 (the original displays correctly in the browser).
- HEIC decoding depends on the FFmpeg build. If it fails, the file is rejected with instructions to switch the iPhone camera to "Most Compatible" (JPEG).
- WebKit (real Safari engine) is not available in this CI environment. The iPhone profile runs on Chromium with iPhone viewport/touch/UA.

## Phase 3: Face Swap with a cloud provider ✅ (engine connected, paid calls not enabled)
- [x] Provider research and comparison: [FACE_SWAP_PROVIDERS.md](FACE_SWAP_PROVIDERS.md). Recommended: **Magic Hour**.
- [x] Modular face swap contract (`src/providers/face-swap/types.ts`): estimate, limits, start-once and poll, plus capabilities.
  - Adapters: `mock` (free, local FFmpeg, labelled TEST), `magichour` (built from the official SDK docs), `gpu-worker` (our HTTP contract, for a future self-hosted server).
- [x] Local face detection on upload (YuNet + SFace, CPU, MIT/Apache-2.0): distinct people across frames, thumbnails, presence. Picks the person to replace and maps them to the provider's face ids.
- [x] Studio UI (`/projects/:id/face-swap`, mobile-first):
  - face photo and video (upload or choose);
  - person picker;
  - consent declaration, stored as `ConsentRecord`s;
  - cost quote;
  - explicit approval checkbox and button;
  - live job tracking;
  - before/after/compare;
  - download.
- [x] Cost safety:
  - per-provider estimate; the quote expires in 30 min; approval must match the exact amount;
  - global `ALLOW_PAID_PROVIDERS` switch; user monthly budget (default $0); per-job cap; daily job limit;
  - start-once guarantee (no double billing on retries or restarts); actual cost recorded from the provider.
- [x] Result handling:
  - original audio restored if missing;
  - AI metadata stamped into the MP4;
  - stored as a `GENERATED`, `aiGenerated` asset with its own preview.
- [x] Tests:
  - 48 unit/integration tests, including a Magic Hour contract test against a local fake that serves the SDK's documented responses, and face detection on real video;
  - E2E of the full flow on the iPhone profile, including approval guards.
- [ ] To go live (needs your approval): a Magic Hour paid plan + API key, cloud deployment ([DEPLOYMENT.md](DEPLOYMENT.md)), `ALLOW_PAID_PROVIDERS=true`, a budget, and a first real test clip.

## Phase 3b: Free Mode ✅
- [x] `FREE_MODE` (default on): paid usage impossible.
  - Paid providers are allowed only with free credits on a free, subscription-less account that covers the whole job.
  - This is checked at quote, at approval (fresh balance) and in the worker right before the call.
- [x] Remaining credits shown (Magic Hour `GET /v1/account`) in the studio and on `/system`.
- [x] Clip trimming and an fps cap (30/24/15) to stretch free credits.
- [x] Open-source engine `facefusion-local` (FaceFusion CLI, default model ghost_1_256 / Apache-2.0), with person selection by reference frame and position. Setup: `scripts/setup-facefusion.sh`.
- [x] Engine picker in the studio (`FACE_SWAP_PROVIDERS`). Unavailable engines are shown with the reason, never faked.
- [x] GitHub Codespaces configuration (`.devcontainer/sahar-face-motion-ai/`) for $0, no-card use from iPhone Safari.
- [x] Tests:
  - Free Mode rules, account/credits contract, clip trimming;
  - FaceFusion adapter against a stand-in CLI;
  - worker modules load outside Next.js (regression found and fixed in this phase);
  - E2E with the engine picker.

## Phase 4: Voice Studio
- ElevenLabs adapter with `eleven_v3` (Hebrew), voice list, male/female, speed/stability/style
- Original "designed" voices (comic, dramatic, cartoon); public-figure parody only as original voices, never clones
- Voice cloning: own voice or a consenting person, with consent record and a spoken verification sentence recorded in-app
- Personal voice library, audio preview, WAV/MP3 download, "attach to video" (FFmpeg mux)

## Phase 5: Lip Sync
- sync.so adapter (`lipsync-2` / `sync-3`), with uploaded audio or a generated voice
- Offset correction (FFmpeg `adelay`/`atrim` before submit), preview, export
- Hebrew speech and singing test matrix

## Phase 6: Motion Transfer
- Runway Act-Two adapter (3–30 s driving video) and/or fal.ai Wan 2.2 Animate
- Clear UI separation from Face Swap; show only supported options (durations, ratios)

## Phase 7: Video Editor & export
- Timeline (clips, trim, order), audio replace, background music, volume, waveform (precomputed peaks)
- 9:16 / 16:9 output, MP4 H.264/AAC export up to 1080p when the source allows
- Results library

## Phase 8: Hardening & deploy
- E2E tests (Playwright, WebKit iPhone profile), load test on the worker
- Security review, abuse monitoring, admin usage view
- Deploy: web (Vercel / container), worker + Redis + Postgres (managed), S3/R2, optional GPU worker

## Decisions needed from the owner
1. Which paid providers to open accounts with (ElevenLabs, sync.so, Runway/fal, a face-swap vendor), and the monthly budget cap.
2. Face swap: hosted API vs self-hosted GPU (cost, privacy, model licence).
3. Hosting target for the public deployment.
