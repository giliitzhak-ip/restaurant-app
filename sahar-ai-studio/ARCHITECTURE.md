# SAHAR AI STUDIO — Architecture

Hebrew-first platform for creating AI music videos: upload a song and a character
reference image, generate lip-synced singing scenes through pluggable AI providers,
arrange them on a timeline, and export an MP4 that carries the **original, unaltered
song** as master audio.

## 1. Guiding principles

1. **Real, not mock.** Every feature that is shown as available is backed by working code
   and persisted state. Modules that are not implemented yet are labelled as such in the
   UI with the phase in which they arrive. No fake progress bars.
2. **No silent spending.** Every billable provider call requires an explicit, persisted
   user approval of an estimated cost, an idempotency key, and a budget check.
3. **The song is immutable.** The uploaded master audio is stored once, content-hashed,
   and never rewritten. All derived data (waveform, analysis, segments) lives elsewhere.
4. **Secrets stay on the server.** Provider keys exist only in server/worker environment
   variables. The browser only learns whether a provider is configured.
5. **Long work runs outside the web server.** The Next.js app only validates, persists
   and enqueues. Media processing, provider submission/polling and FFmpeg rendering run
   in the worker process via BullMQ.
6. **Providers behind adapters.** Provider-specific request/response shapes never leak
   outside `packages/providers/<provider>`.
7. **Honest capabilities.** Provider capabilities, limits and prices come from the
   provider's current official documentation, recorded with a "verified on" date. The
   local-GPU provider is reported as non-operational until a real backend exists.

## 2. System overview

```
                ┌──────────────────────────── Browser (Hebrew RTL / English LTR) ──┐
                │ Next.js App Router UI · React 19 · Tailwind v4 · shadcn/ui       │
                └──────────────┬──────────────────────────────────────▲────────────┘
                               │ Server Actions / Route Handlers      │ signed media URLs
┌──────────────────────────────▼──────────────────────┐               │
│ apps/web  (Next.js, Node runtime)                   │               │
│  • auth (sessions, scrypt passwords, rate limiting) │               │
│  • authorization (ownership checks on every query)  │               │
│  • upload validation → presigned PUT to storage     │               │
│  • cost estimate + approval → enqueue job           │               │
│  • provider webhooks (signature verification)       │               │
└───────┬───────────────────────┬─────────────────────┘               │
        │ Prisma                │ BullMQ (enqueue)                    │
┌───────▼────────┐      ┌───────▼────────┐        ┌───────────────────┴──┐
│ PostgreSQL 16  │◀────▶│ Redis 7        │        │ S3-compatible storage │
│ source of truth│      │ queues, rate   │        │ (SeaweedFS in dev)        │
└───────▲────────┘      │ limits         │        │ private bucket        │
        │               └───────▲────────┘        └───────────▲──────────┘
        │ Prisma                │ BullMQ (consume)            │ get/put
┌───────┴───────────────────────┴─────────────────────────────┴──────────┐
│ apps/worker  (Node 22)                                                 │
│  • maintenance queue (expired session cleanup)        — Phase 1        │
│  • media queue: ffprobe, waveform, silence, tempo     — Phase 2        │
│  • generation queue: provider submit / poll / fetch   — Phase 3+       │
│  • render queue: FFmpeg assembly with progress        — Phase 5        │
│  • optional Python analysis sidecar (librosa/aubio)   — Phase 2/7      │
└────────────────────────────────────────────────────────────────────────┘
                               │ HTTPS (server-side only)
              ┌────────────────┼──────────────────┬───────────────────┐
              ▼                ▼                  ▼                   ▼
         Mock Provider     Hedra API         fal.ai lip-sync    Local GPU (future)
```

## 3. Monorepo layout

```
sahar-ai-studio/
├── apps/
│   ├── web/            Next.js App Router application (UI + API + webhooks)
│   └── worker/         BullMQ worker process (maintenance now; media/AI/render later)
├── packages/
│   ├── db/             Prisma schema, migrations, client singleton, seed
│   ├── shared/         env validation, structured logger, queue names, i18n
│   │                   dictionaries, domain constants (e.g. character presets)
│   └── providers/      AI provider interface + adapters            (Phase 3+)
├── docker/             Dockerfiles for web and worker
├── docs/               operational docs (backup & recovery, …)
├── docker-compose.yml  postgres, redis, seaweedfs S3 (+ bucket init), migrate, web, worker
└── .env.example
```

Tooling: pnpm workspaces, TypeScript strict (`noUncheckedIndexedAccess`), ESLint 9 flat
config, Vitest (unit + DB/Redis integration), Playwright (end-to-end against a real
server, database and Redis).

Workspace packages are consumed as TypeScript source (`exports` → `src/index.ts`).
Next.js compiles them via `transpilePackages`; the worker is bundled with `tsup`.

## 4. Web application

- **Routing.** `app/(auth)` holds the public login/register pages; `app/(app)` holds all
  authenticated pages behind a layout that validates the session against the database.
- **Middleware** performs only an optimistic cookie-presence redirect. The authoritative
  check is `requireUser()` on the server, executed by the `(app)` layout, every server
  action and every route handler.
- **i18n.** Typed dictionaries (`he` is the source of truth; `en` must have identical
  keys, enforced by type-checking and a unit test). The locale comes from the user's
  stored preference, falling back to a cookie, falling back to Hebrew. `<html lang dir>`
  is set server-side, so there is no layout flash. All layout uses logical CSS
  properties (`ps-*`, `me-*`, `start-*`, `border-e`) so the same markup is correct in
  RTL and LTR.
- **Design system.** Dark neutral surfaces with subtle gold accent tokens defined as CSS
  variables in Tailwind v4 `@theme`. shadcn/ui-style components live in
  `components/ui` (owned source, Radix primitives, `class-variance-authority`).
- **Responsive.** Desktop: persistent side navigation. Mobile/iPhone: top bar with a
  drawer navigation, `100dvh`, safe-area insets, 44px touch targets, no hover-only UI.

## 5. Authentication & authorization

- Email + password. Passwords hashed with Node's built-in **scrypt**
  (N=2^15, r=8, p=1, 16-byte salt, 64-byte key) and compared with `timingSafeEqual`.
- Sessions: 32 random bytes, sent to the browser once in an `HttpOnly`, `SameSite=Lax`,
  `Secure` (in production) cookie. Only the **SHA-256 hash** of the token is stored in
  `Session.tokenHash`, so a database leak does not leak usable sessions. Sliding expiry
  (30 days, refreshed at most once per day). Expired sessions are purged by the worker.
- Server Actions get Next.js's built-in Origin/Host CSRF protection; route handlers that
  mutate state check the Origin header explicitly.
- **Rate limiting** (Redis, fixed window) on login and registration, keyed by IP and by
  email. Redis unavailability fails _closed_ for auth endpoints.
- Registration can be disabled with `ALLOW_REGISTRATION=false` for private deployments.
- Registration requires accepting the usage-rights policy; acceptance is timestamped.
- **Ownership.** Every domain row carries `ownerId` (directly or via its project).
  Data-access helpers always filter by the current user; IDs from the client are never
  trusted without that filter. Not-found and not-owned return the same 404.
- Security-relevant events (register, login success/failure, logout) go to `AuditLog`.

## 6. Media & storage (Phase 2 — implemented)

- Private S3-compatible bucket (`packages/storage`); nothing is ever public.
- **Uploads stream through the web server** (`POST /api/uploads`), not via presigned PUT:
  storage stays unreachable from browsers (important for iPhone/LAN use and for any host
  without public S3), and the server can enforce every rule while the bytes flow:
  1. session + same-origin (CSRF) check, per-user upload rate limit;
  2. ownership of the destination project/character;
  3. consent statement version must be sent (`X-Consent`); the exact text shown, its
     version and the IP are stored in `ConsentRecord` with the asset;
  4. `Content-Length` checked against the limit, then **magic-byte sniffing** of the first
     bytes — anything not MP3/WAV (songs) or JPEG/PNG/WebP (references) is refused before
     a single byte is stored;
  5. streamed multipart to S3 while counting bytes (hard cap) and computing SHA-256.
- Middleware does not run on `/api/*` (it would buffer request bodies).
- The worker then verifies with `ffprobe`; invalid media is marked `FAILED` with a reason
  and its object deleted. Images keep their original bytes (no re-encode, no thumbnails —
  browsers apply EXIF orientation to originals correctly).
- **Downloads** go through `GET /api/media/:assetId` (owner check, 404 for not-owned) with
  HTTP Range support (206), which iOS Safari requires for audio/video playback. Presigned
  GET URLs remain an option later for a CDN.
- Object keys: `users/<userId>/<assetId>/original.<ext>` — never user-controlled names.
- Limits (configurable): audio ≤ 100 MB and ≤ 20 min, images ≤ 15 MB, 256–12,000 px.

## 7. Audio analysis (Phase 2 — implemented, `packages/media` + worker)

- `ffprobe` → duration, sample rate, channels, codec, bitrate (validated: one audio
  stream, MP3 or PCM WAV, cover art allowed, no video).
- One `ffmpeg` pass decodes to mono 11,025 Hz PCM and runs `silencedetect`
  (−40 dB, ≥ 0.5 s). From the PCM: waveform peaks (100/s, stored as JSON object) and
  tempo.
- Tempo/beat (TypeScript, no Python needed): log-magnitude spectral-flux onset envelope →
  autocorrelation with a log-normal prior around 120 BPM, refined over 6 beat periods →
  dynamic-programming beat tracker (Ellis 2007). A confidence in [0, 1] is always stored;
  BPM and beats are stored **only when confidence ≥ 0.3**, and a half/double-tempo
  alternative is reported when it is nearly as plausible. Validated on synthetic click
  tracks (72–174 BPM within ±1.5 BPM, beats within 35 ms; noise/tones rejected) — **not
  yet validated on a corpus of real songs**, so the UI presents it as a suggestion.
- After analysis, if the project has no scenes, scenes are proposed automatically:
  cuts prefer the middle of silences, then beats, within 3–12 s (target 8 s). The user
  edits them on the timeline (drag, split, merge, auto-propose again).
- **Identity consistency:** every new scene gets the project's main character and that
  character's primary reference image. The scene editor flags scenes that deviate and can
  re-apply the main identity to all scenes. Deleting a reference image used by scenes is
  blocked. No reference images are ever generated by the system.
- The timeline's time axis always runs left → right (video-editor convention), inside an
  otherwise RTL interface; times and BPM values are Unicode-isolated in Hebrew text.

## 8. AI provider abstraction (Phase 3+)

```ts
interface VideoProvider {
  key: ProviderKey; // 'mock' | 'hedra' | 'fal-lipsync' | 'local-gpu'
  capabilities(): ProviderCapabilities; // inputs, max duration, aspect ratios,
  // resolutions, pricing metadata (+ verifiedAt)
  isOperational(): { ok: boolean; reason?: string };
  estimateCost(input): CostEstimate;
  submit(input, { idempotencyKey }): Promise<{ providerJobId: string }>;
  getStatus(providerJobId): Promise<NormalizedStatus>;
  fetchResult(providerJobId): Promise<ResultStream>;
  cancel?(providerJobId): Promise<void>;
  verifyWebhook?(req): Promise<WebhookEvent | null>;
}
```

Implementations, in order: **Mock** (real pipeline, generates an actual video locally
with FFmpeg from the reference image + audio segment, zero cost), **Hedra**, **fal.ai
lip-sync**, **Local GPU** (interface only, `isOperational() → false` until a real
inference backend is implemented and tested). Endpoints, parameters and pricing for real
providers are taken from the official docs at implementation time — never guessed.

## 9. Generation workflow & idempotency (Phase 3+)

1. User selects scene/segment and provider → server computes estimate.
2. User approves → `GenerationJob` row created in a transaction with
   `status=QUEUED`, `approvedAt`, the estimate, an `idempotencyKey`, and a budget check
   against the user's monthly limit.
3. BullMQ job uses the `GenerationJob.id` as its `jobId` (dedupes enqueue).
4. Worker: if `providerJobId` already stored → never submit again, only poll. Otherwise
   it transitions `QUEUED → SUBMITTING` with a conditional update (compare-and-set),
   submits with the idempotency key (where the provider supports one), and stores
   `providerJobId` immediately. A crash between submit and persist is surfaced as
   `NEEDS_RECONCILIATION` instead of being blindly retried, preventing double billing.
5. Completion arrives by verified webhook or by polling with exponential backoff and a
   hard deadline. The result is downloaded into our storage and a `Take` is created.
6. All transitions are appended to `GenerationJobEvent`.

## 10. Rendering (Phase 5)

FFmpeg in the worker: every take normalized (scale + pad, never stretch; constant frame
rate; trimmed using scene start/end and manual offset), concatenated, then muxed with the
**original song** as the only audio stream (`-map` explicitly, AAC), H.264 `yuv420p`,
`+faststart`, 1920×1080 or 1080×1920 when sources allow. Progress is parsed from
`-progress pipe:1` (`out_time_us` / total duration), so the percentage is real.

## 11. Cost management

Estimates and actuals are stored per `GenerationJob` (USD where the provider publishes a
USD price, plus raw provider units such as credits). Reports are aggregations over jobs:
per scene, per project, per month. Monthly budget is enforced at approval time.

## 12. Observability & reliability

- Structured JSON logs (pino) with request/job context; secrets redacted.
- `/api/health` reports database and Redis reachability.
- BullMQ retries with exponential backoff for retry-safe steps only.
- Prisma migrations are the only way schema changes reach a database.
- See `docs/BACKUP_AND_RECOVERY.md`.

## 13. Key decisions

| Decision  | Choice                                               | Why                                                                       |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Framework | Next.js 15.5 (App Router)                            | Stable line; v16 is new enough to add risk without benefit now.           |
| ORM       | Prisma 6.19                                          | Latest stable major (7.x/8.x RC lines avoided).                           |
| Auth      | In-house sessions + scrypt                           | Small, auditable, no beta dependency; DB-backed revocable sessions.       |
| Queue     | BullMQ on Redis                                      | Retries, backoff, repeatable jobs, job-id dedupe.                         |
| Storage   | S3 API (SeaweedFS locally)                           | Same code path for AWS S3, Cloudflare R2, Backblaze B2, SeaweedFS, MinIO. |
| Python    | Only for audio analysis/local inference if justified | Keeps the core single-language.                                           |
