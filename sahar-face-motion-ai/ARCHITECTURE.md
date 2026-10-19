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

* **Web process never does heavy work.** Uploads go straight to S3 via pre-signed URLs; every AI or FFmpeg task is a `Job` row plus a BullMQ job processed by the worker. The UI polls `/api/jobs/:id` for real progress.
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
│   ├── server/                 server-only services (system status; later: storage, jobs)
│   ├── worker/                 BullMQ worker entry point (added in phase 2)
│   └── middleware.ts           cookie-presence redirect for protected routes
├── docker-compose.yml          Postgres + Redis + MinIO for local dev
└── *.md                        this documentation
```

## 3. Authentication & authorization

* Email + password, hashed with bcrypt (cost 12).
* Sessions: a random 256-bit token sits in an `httpOnly`, `SameSite=Lax` cookie. Only its SHA-256 is stored in `Session.tokenHash`, so a database leak does not expose usable sessions. The cookie is `Secure` whenever `APP_URL` is https. Sessions last 30 days.
* Login is rate limited per IP (30 per 15 min) and per email (8 per 15 min) in Redis. Registration is limited to 5 per hour per IP. Login also runs a bcrypt comparison for unknown emails, so timing does not reveal which accounts exist.
* State-changing API routes check `Origin` against `Host` (CSRF defence in depth).
* Every protected page and API route re-validates the session on the server; middleware only does a fast redirect.
* **Project access (phase 2+):** every query filters by `ownerId = currentUser.id`. Assets are never public; downloads use short-lived signed URLs issued after an ownership check.

## 4. Media pipeline (phases 2–7)

1. Client asks `/api/uploads` for a pre-signed PUT URL. The server first validates MIME type, extension and size limits from env.
2. The browser uploads directly to S3 and then calls `/api/assets/complete`.
3. A `MEDIA_PROBE` job runs `ffprobe`. It rejects files that are not real media or exceed duration limits, and stores width/height/fps/duration/audio. For Safari it also creates a preview proxy (H.264/AAC MP4 with `+faststart`) and a poster frame.
4. AI jobs: the worker creates signed GET URLs, calls `provider.submit()`, stores `providerJobId`, and polls with backoff (or receives a webhook when the vendor supports one). It then downloads the result into our bucket as a `GENERATED` asset with `aiGenerated = true`, and records usage and cost.
5. Exports: FFmpeg filter graphs handle trim, concat, audio replace and mix (`amix`, volume), aspect-ratio pad/crop (9:16 / 16:9), up to 1080p when the source allows, plus an "AI-generated" metadata tag. A visible watermark is optional.

## 5. Provider research summary (Oct 2026)

Only vendor docs and official SDK source were consulted, and no paid API was called. Items marked *unverified* must be confirmed against the vendor dashboard before integration.

| Module | Candidate | API shape | Notes |
|---|---|---|---|
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

## 6. GPU worker (future)

`GPU_WORKER_URL` will point to a FastAPI service running next to FaceFusion (or other open models) on a CUDA machine. It will expose `POST /jobs` (signed input URLs, returns id), `GET /jobs/{id}` (status/progress) and upload results to a signed PUT URL. Auth is a bearer token (`GPU_WORKER_TOKEN`). It implements the same provider interfaces as the cloud adapters.

## 7. Security & abuse controls

* All API keys are server-side env vars only (no `NEXT_PUBLIC_`).
* Security headers: `X-Frame-Options: DENY`, `nosniff`, a strict Referrer-Policy and a Permissions-Policy.
* Upload allow-lists, size and duration limits, and a server-side FFprobe check of the real content type.
* Per-user `dailyJobLimit` and `monthlyBudgetCents` (default 0, so paid providers are off) are enforced before enqueueing. There is also the global `ALLOW_PAID_PROVIDERS` kill-switch.
* Consent gating: face-swap, lip-sync and voice-clone jobs require an active (non-revoked) `ConsentRecord` of the matching subject type.
* Data deletion: delete a project (cascade plus S3 prefix purge), or delete the account (all rows, objects, and provider-side cloned voices).
