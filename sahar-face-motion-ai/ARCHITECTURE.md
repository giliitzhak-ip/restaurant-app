# SAHAR FACE MOTION AI — Architecture

## 1. Overview

```
 iPhone Safari / Desktop browser  (Hebrew RTL UI, Next.js App Router, Tailwind, shadcn-style components)
            │  HTTPS, httpOnly session cookie
            ▼
 ┌──────────────────────── Next.js server (Node 22) ────────────────────────┐
 │  Pages (RSC)    API routes (/api/*)    Auth/session    Rate limiting      │
 │  Validation (zod, Hebrew messages)     Consent records  Usage/cost guard  │
 └──────┬──────────────────┬──────────────────────┬──────────────────────────┘
        │ Prisma           │ BullMQ (enqueue)     │ signed URLs
        ▼                  ▼                      ▼
   PostgreSQL            Redis              S3-compatible storage
   (users, projects,     (queues,           (MinIO local / S3 / R2)
    assets, jobs,         rate limits)              ▲
    consents, usage)       │                        │
                           ▼                        │
              ┌──────── Worker process (Node, `npm run worker`) ────────┐
              │  FFmpeg / FFprobe  (probe, transcode, mux, trim, export) │
              │  Provider adapters ──► cloud AI APIs (async submit/poll) │
              │                    ──► self-hosted GPU worker (future)   │
              │                    ──► Mock provider (tests)             │
              └──────────────────────────────────────────────────────────┘
```

Key principles:

* **Web process never does heavy work.** It only streams uploads into storage. Every AI or FFmpeg task is a `Job` row plus a BullMQ job processed by the worker, and the UI polls the project endpoint for real progress while files are processing.
* **Provider adapters are swappable.** Each capability has its own interface in `src/providers/types.ts` (`FaceSwapProvider`, `MotionTransferProvider`, `VoiceProvider`, `LipSyncProvider`). The module's provider is chosen with an env var (`FACE_SWAP_PROVIDER=…`). The status page reports exactly which adapter is selected, whether it has been built, which keys are missing, and whether paid use is allowed.
* **Nothing fake.** The registry only reports a provider as `ready` when the adapter exists in code, its keys are set and (for paid vendors) `ALLOW_PAID_PROVIDERS=true`. The Mock provider makes real files (for example a valid WAV) to test the pipeline, and the UI labels its output as a test, never as AI output.
* **Consent and AI disclosure are part of the data model.** Every face/voice input used for synthesis must reference a `ConsentRecord`, and every model output is stored with `aiGenerated = true`.

## 2. Repository layout

```
sahar-face-motion-ai/
├── prisma/schema.prisma        full domain model (all phases)
├── src/
│   ├── app/                    Next.js routes (pages + /api)
│   ├── components/ui/          shadcn-style primitives (Button, Card, Input…)
│   ├── components/layout/      AppShell (header + iPhone tab bar), Logo, AI disclosure
│   ├── components/auth/        login/register form, logout, delete account
│   ├── lib/                    db, redis, session, password, tokens, validation, rate-limit
│   ├── providers/              provider contracts, registry, mock adapter
│   ├── server/                 server services: storage drivers, media (policy/ffprobe/ffmpeg), queue, projects, status
│   ├── worker/                 BullMQ media worker (`npm run worker`)
│   ├── test/                   test fixtures (real media generated with FFmpeg)
│   └── middleware.ts           cookie-presence redirect for protected routes
├── e2e/                        Playwright end-to-end tests (iPhone + desktop profiles)
├── docker-compose.yml          Postgres + Redis + MinIO for local dev
└── *.md                        this documentation
```

## 3. Authentication & authorization

* Email + password, hashed with bcrypt (cost 12).
* Sessions: a random 256-bit token sits in an `httpOnly`, `SameSite=Lax` cookie. Only its SHA-256 is stored in `Session.tokenHash`, so a database leak does not expose usable sessions. The cookie is `Secure` whenever `APP_URL` is https. Sessions last 30 days.
* Login is rate limited per IP (30 per 15 min) and per email (8 per 15 min) in Redis. Registration is limited to 5 per hour per IP. Login also runs a bcrypt comparison for unknown emails, so timing does not reveal which accounts exist.
* State-changing API routes check `Origin` against `Host` (CSRF defence in depth).
* Every protected page and API route re-validates the session on the server; middleware only does a fast redirect.
* **Project access:** every query filters by `ownerId = currentUser.id`, and another user's ids return 404 (verified in E2E). Assets are never public: files are streamed through an authenticated route after an ownership check, and storage keys are never exposed to the browser.

## 4. Media pipeline (phases 2–7)

1. *(Implemented in phase 2.)* The browser streams the file to `POST /api/projects/:id/assets` (XHR, so upload progress is real). The server checks the type allow-list, size and quota, hashes the file, and stores it via the storage driver (`src/server/storage`: S3 or local disk).
2. *(Implemented.)* A `MEDIA_PROBE` job runs `ffprobe` in the worker (`src/worker`). It rejects files that are not real media of the declared kind or exceed limits, and stores display width/height (rotation-aware), fps, duration, codecs and audio presence. It creates an H.264/AAC MP4 preview (`+faststart`, short side ≤720), a JPEG poster, and JPEG/AAC previews for images and audio. Progress is parsed from `ffmpeg -progress`.
3. *(Implemented.)* `GET /api/assets/:id/file?v=original|preview|poster` streams to the owner only, with HTTP Range support (Safari).
4. AI jobs: the worker creates signed GET URLs, calls `provider.submit()`, stores `providerJobId`, and polls with backoff (or receives a webhook when the vendor supports one). It then downloads the result into our bucket as a `GENERATED` asset with `aiGenerated = true`, and records usage and cost.
5. Exports: FFmpeg filter graphs handle trim, concat, audio replace and mix (`amix`, volume), aspect-ratio pad/crop (9:16 / 16:9), up to 1080p when the source allows, plus an "AI-generated" metadata tag. A visible watermark is optional.

## 5. Provider research summary (Oct 2026)

Only vendor docs and official SDK source were consulted, and no paid API was called. Items marked *unverified* must be confirmed against the vendor dashboard before integration.

| Module | Candidate | API shape | Notes |
|---|---|---|---|
| Face Swap | **Magic Hour**: chosen in phase 3, see [FACE_SWAP_PROVIDERS.md](FACE_SWAP_PROVIDERS.md) | `POST https://api.magichour.ai/v1/face-swap` (+ upload-urls, face-detection, video-projects), Bearer | 1 credit/frame; adapter implemented |
| Face Swap | **FaceFusion** (self-hosted GPU worker) | CLI only (`headless-run`, `job-*`); no HTTP API, so we must wrap it in our own FastAPI service | Code is OpenRAIL-AS. The default `inswapper_128` model is **non-commercial** (InsightFace). Commercial use needs a different swapper model with a verified licence, or a paid InsightFace licence. Needs an NVIDIA CUDA GPU for video. |
| Face Swap | Akool | `POST https://openapi.akool.com/api/open/v3/faceswap/highquality/specifyvideo` (marked legacy; v4 "Face Swap Plus"); async with webhook/poll | Exact auth header and pricing unverified. |
| Face Swap | Replicate community models | `POST https://api.replicate.com/v1/predictions` | Built on inswapper/roop, so the same licence risk applies. |
| Motion Transfer | **Runway Act-Two** | `POST https://api.dev.runwayml.com/v1/character_performance`, `model: "act_two"`, headers `Authorization: Bearer`, `X-Runway-Version: 2024-11-06`; poll `GET /v1/tasks/{id}` | Driving video must be 3–30 s. About 5 credits/s ($0.05/s). |
| Motion Transfer | Wan 2.2 Animate on fal.ai | `POST https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/move`, `Authorization: Key …` | Apache-2.0 model, 480p/720p output. |
| Motion Transfer | Viggle | `POST /v1/renders`, poll `GET /v1/renders/{id}` | Auth and limits unverified. |
| Voice | **ElevenLabs** | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, header `xi-api-key`; IVC `POST /v1/voices/add`; STS `POST /v1/speech-to-speech/{voice_id}` | **Hebrew: only `eleven_v3` / `eleven_v4`** (multilingual_v2 and flash do not list Hebrew). Speech-to-speech model `eleven_multilingual_sts_v2`: Hebrew unverified. Cloning requires the rights/consent of the person; we collect our own consent record. |
| Voice | Resemble AI | `POST https://f.cluster.resemble.ai/synthesize` | Hebrew quality is doubtful per independent tests, so it is a secondary option. |
| Lip Sync | **Sync Labs (sync.so)** | `POST https://api.sync.so/v2/generate`, header `x-api-key`; poll `GET /v2/generate/{id}` or webhook | Models `sync-3`, `lipsync-2`, `lipsync-2-pro`. Audio-driven, so it should be language-agnostic; Hebrew is not explicitly documented and will be tested in phase 5. |
| Lip Sync | fal.ai | `fal-ai/sync-lipsync/v2`, `fal-ai/latentsync` | Alternatives. |

**Face Swap vs Motion Transfer are separate modules.** Face swap keeps the target video's body and replaces only the face. Motion transfer generates a new video of the character from a still image, driven by the reference motion.

## 5b. Face swap pipeline (phase 3)

```
upload ─► media worker: FFprobe → preview → YuNet+SFace face detection (people, thumbnails)
studio ─► POST /api/face-swap/quote   consent records + PENDING_APPROVAL job + cost quote (no provider call)
       ─► POST /api/jobs/:id/approve  exact amount + acceptCharge; budget/limits re-checked; → QUEUED
ai worker ─► provider.start() once → providerJobId saved → provider.poll() with backoff
          ─► download result → restore audio if missing → stamp AI metadata → GENERATED asset → preview job
```

- **Adapters** (`src/providers/face-swap/`): `mock` (local FFmpeg, labelled TEST), `magichour` (cloud), `gpu-worker` (self-hosted). Selected with `FACE_SWAP_PROVIDER`.
- **Billing safety:**
  - `start()` is never retried. If it throws, the job fails with "check the provider dashboard".
  - Retries and restarts resume polling from the saved `providerJobId`.
  - Approval is a conditional update (`PENDING_APPROVAL` → `QUEUED`), so double taps can't approve twice.
- **Person selection:**
  - Our detector clusters faces across sampled frames with SFace embeddings.
  - For Magic Hour, the chosen person's crop is matched (SFace cosine ≥ 0.363) against Magic Hour's own (free) face detection, and sent as `face_mappings`.
  - If no confident match exists, the job is refused before the billable call.

## 6. GPU worker (future)

`GPU_WORKER_URL` points to our own small HTTP service in front of FaceFusion (or another open model) on a CUDA machine. The adapter (`src/providers/face-swap/gpu-worker.ts`) already speaks this contract:

```
POST /v1/face-swap   Authorization: Bearer $GPU_WORKER_TOKEN
     { source_url, target_url, target_face: { box: {x,y,w,h} (0..1), time_sec } | null }   →  { id }
GET  /v1/jobs/{id}   →  { status: queued|running|succeeded|failed, progress?: 0..1, output_url?, error? }
```

Inputs are time-limited signed URLs (S3 pre-signed, or `/api/media/signed` HMAC links for local storage). The model on the server must be licensed for commercial use; the default `inswapper_128` is not.

## 7. Security & abuse controls

* All API keys are server-side env vars only (no `NEXT_PUBLIC_`).
* Security headers: `X-Frame-Options: DENY`, `nosniff`, a strict Referrer-Policy and a Permissions-Policy.
* Upload allow-lists, size and duration limits, and a server-side FFprobe check of the real content type.
* Per-user `dailyJobLimit` and `monthlyBudgetCents` (default 0, so paid providers are off) are enforced before enqueueing. There is also the global `ALLOW_PAID_PROVIDERS` kill-switch.
* Consent gating: face-swap, lip-sync and voice-clone jobs require an active (non-revoked) `ConsentRecord` of the matching subject type.
* Data deletion: delete a project (cascade plus S3 prefix purge), or delete the account (all rows, objects, and provider-side cloned voices).
