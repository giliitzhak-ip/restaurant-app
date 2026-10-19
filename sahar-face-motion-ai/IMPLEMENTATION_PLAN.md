# Implementation plan

Each phase ends with: tests passing, a production build, a manual check at iPhone size, and **user approval before the next phase starts**.

## Phase 1: Foundation ✅ (this delivery)
- [x] Next.js 15 + React 19 + TypeScript + Tailwind 4 + shadcn-style components
- [x] Hebrew RTL, black/gold/dark-grey theme, Heebo font, iPhone safe areas, bottom tab bar, 16px inputs (no Safari zoom)
- [x] PostgreSQL + Prisma: full schema and initial migration
- [x] Auth: register (with terms + consent acceptance), login, logout, sessions (hashed tokens), rate limiting, CSRF origin check
- [x] Account page with permanent data deletion
- [x] Provider architecture: contracts, registry with honest readiness, mock voice adapter
- [x] System status page: DB, Redis, FFmpeg/FFprobe, S3 config, per-module provider state
- [x] Terms & consent policy page, AI-content disclosure on every page
- [x] Unit tests (vitest), lint, typecheck, production build; docker-compose for Postgres/Redis/MinIO

## Phase 2: Uploads, projects, preview
- S3 storage service (MinIO locally), pre-signed upload/download, bucket bootstrap
- Upload UI (drag & drop / iPhone photo picker) with real progress (XHR upload progress)
- BullMQ worker (`npm run worker`), `MEDIA_PROBE` job: FFprobe validation, Safari-friendly preview proxy, poster frame
- Project library: create, rename, list, open, duplicate, delete (rows + S3 objects), history panel
- Job status API plus a progress bar component

## Phase 3: Face Swap (first real engine)
- Consent capture UI → `ConsentRecord`
- Face detection step: choose the target face (thumbnails per detected face)
- First real adapter. Recommended: a self-hosted FaceFusion GPU worker with a commercially licensed swapper model, **or** a hosted API (Akool / Replicate) once its licence and pricing are confirmed with you
- Before/after slider, download, AI label in metadata
- Cost estimate before running, plus budget and daily-limit enforcement

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
