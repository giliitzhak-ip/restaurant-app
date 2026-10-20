# SAHAR AI STUDIO

Hebrew-first platform for creating AI music videos with lip-synced singing characters.

- Design: [ARCHITECTURE.md](ARCHITECTURE.md)
- Roadmap and status: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- Data model: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- Operations: [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md)

**Current status: Phase 3 complete.** Accounts and security (Phase 1); characters,
uploads, projects, audio analysis and the scene timeline (Phase 2); and an end-to-end
generation pipeline (Phase 3): cost estimate → explicit approval → job queue → worker →
stored MP4 take that plays inline and downloads on iPhone. The only engine connected is
a **technical test engine** that renders a real MP4 with FFmpeg — it is not AI and is
labelled as such in the UI and inside the video. Paid AI providers arrive in Phase 4.

## Requirements

- Node.js 22+ and pnpm 10 (`corepack enable`)
- Docker with Compose v2 (for PostgreSQL 16, Redis 7 and S3-compatible storage), **or**
  locally installed PostgreSQL 16 and Redis 7
- FFmpeg/FFprobe on the worker's PATH (media verification and audio analysis)

## Quick start (local development)

```bash
cd sahar-ai-studio
cp .env.example .env
# Set a real secret:
sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')|" .env

pnpm install                 # also generates the Prisma client
pnpm infra:up                # postgres, redis, seaweedfs (S3) + private bucket
pnpm db:deploy               # apply migrations to the dev database
pnpm dev                     # web on http://localhost:3000 + worker
```

Open http://localhost:3000, create an account, and you land on the dashboard. The
"System status" card shows live database, Redis, worker and storage status.

Run the processes separately if you prefer: `pnpm dev:web`, `pnpm dev:worker`.

### Without Docker

Point `DATABASE_URL`, `TEST_DATABASE_URL` and `REDIS_URL` in `.env` at your own
PostgreSQL 16 / Redis 7 (Redis must be ≥ 7 and use `maxmemory-policy noeviction`).
Create the two databases (`sahar`, `sahar_test`) owned by the configured user.

## Opening it on an iPhone (same Wi-Fi)

```bash
pnpm dev            # Next.js listens on all interfaces and prints a "Network:" URL
```

On the iPhone, open Safari at `http://<your-computer-LAN-IP>:3000` (e.g.
`http://192.168.1.20:3000`). Use `pnpm dev` for this, not `pnpm start`: production mode
sets `Secure` cookies, which Safari only stores over HTTPS. For production, serve the app
over HTTPS behind a reverse proxy.

Uploading on iPhone: photos picked from the library are converted to JPEG by iOS
automatically (HEIC is not accepted by the server). Songs can be picked from the Files app.

## Production build

```bash
pnpm build                   # prisma generate + next build (standalone) + worker bundle
pnpm db:deploy
pnpm start:web               # serves on $PORT (default 3000)
pnpm start:worker            # set env vars in the environment (no .env needed)
```

Containers: `docker compose --profile app up -d --build` builds and runs `migrate`,
`web` and `worker` alongside the infrastructure. Change every default credential in
`docker-compose.yml`, `docker/seaweedfs-s3.json` and `.env` before any shared deployment,
and terminate TLS in front of the web container.

## Quality checks

```bash
pnpm typecheck               # strict TypeScript, all packages
pnpm lint                    # ESLint (flat config, Next.js rules)
pnpm format:check            # Prettier
pnpm test                    # unit tests (no services needed)
pnpm test:integration        # PostgreSQL + Redis integration tests (uses TEST_DATABASE_URL)
pnpm --filter @sahar/web test:e2e:build
                             # Playwright: desktop Chromium + iPhone 14 viewport,
                             # real server on :3100 + real worker, test DB, Redis DB 15,
                             # S3 storage from .env (run `pnpm infra:up` first)
pnpm check                   # typecheck + lint + unit + integration
```

The e2e and integration suites refuse to run if `TEST_DATABASE_URL` equals
`DATABASE_URL`, and the e2e setup truncates the test database on every run.

## Workspace layout

| Path                   | Purpose                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`             | Next.js 15 App Router UI, server actions, route handlers                                                                           |
| `apps/worker`          | BullMQ worker: session cleanup, media verification/analysis, generation jobs (final render later)                                  |
| `packages/db`          | Prisma schema, migrations, client                                                                                                  |
| `packages/shared`      | Env validation, logger, queue names, consent texts, character presets                                                              |
| `packages/storage`     | S3 client: streamed uploads, ranged reads, deletes, key scheme                                                                     |
| `packages/providers`   | Provider contract, capabilities, cost estimates, Mock (FFmpeg) and Local-GPU stub                                                  |
| `packages/media`       | Pure media logic: magic-byte sniffing, ffprobe validation, waveform peaks, silence parsing, tempo/beat estimation, scene proposals |
| `scripts/fixtures.mjs` | Generates synthetic test media with FFmpeg (no binary fixtures in git)                                                             |

## Security notes

- Provider API keys are read only on the server/worker from environment variables.
  The settings page shows whether each key is set, never its value.
- No paid AI generation can run without an explicit, recorded approval and a monthly
  budget (enforced from Phase 3).
- Sessions are DB-backed (only token hashes are stored), cookies are `HttpOnly`,
  `SameSite=Lax` and `Secure` in production. Login and sign-up are rate limited.
- Set `ALLOW_REGISTRATION=false` once your own account exists on a private deployment.
