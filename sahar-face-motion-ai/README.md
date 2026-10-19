# SAHAR FACE MOTION AI

A Hebrew (RTL) web platform for making AI videos: face swap, motion transfer, synthetic Hebrew voices, lip sync and video editing, with built-in consent management and AI-content labelling.

> **Status: Phase 1 of 8.** The foundation is in place: database, user accounts, Hebrew UI and system status. The AI modules are not connected yet. The dashboard shows each module's real status and does not pretend to process anything. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Docs: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · [.env.example](.env.example)

## Requirements

- Node.js 22+
- PostgreSQL 16, Redis 7 (or Docker for `docker compose up`)
- FFmpeg + FFprobe on `PATH` (used from phase 2)

## Setup

```bash
cd sahar-face-motion-ai
npm install
cp .env.example .env
# set APP_SECRET:  openssl rand -hex 32

docker compose up -d            # Postgres + Redis + MinIO (or use your own services)
npx prisma migrate deploy       # create tables
npm run build && npm start      # production server on http://0.0.0.0:3000
# or: npm run dev               # development with hot reload
```

## Checks

```bash
npm test          # unit tests (vitest)
npm run lint      # ESLint
npm run typecheck # TypeScript
```

`GET /api/health` returns DB/Redis/FFmpeg readiness. Signed-in users can see detailed status, including AI providers, at `/system`.

## Opening on an iPhone

Nothing needs to be installed on the phone. Safari is enough.

**Option A: same Wi-Fi network (development).**
1. Run the server on a computer: `npm run build && npm start` (it listens on `0.0.0.0:3000`).
2. Find the computer's local IP (macOS: `ipconfig getifaddr en0`; Windows: `ipconfig`).
3. Set `APP_URL=http://<that-ip>:3000` in `.env` and restart.
4. On the iPhone, open Safari at `http://<that-ip>:3000`.
5. Optional: Share → "Add to Home Screen" to get an app-like icon. The app is set up for full-screen mode and the iPhone notch.

**Option B: public HTTPS deployment (recommended for real use).** Deploy the web app (for example Vercel, Render or Fly.io) with managed Postgres and Redis, set `APP_URL=https://…`, and open the URL in Safari. With HTTPS the session cookie is automatically `Secure`.

## Responsible use

Using a person's face or voice requires their explicit consent. The app records consent, labels every AI output as synthetic, and does not allow cloning real people's voices without verified consent. Paid AI providers stay disabled until `ALLOW_PAID_PROVIDERS=true` **and** the user has a budget.

## Project layout

See [ARCHITECTURE.md §2](ARCHITECTURE.md#2-repository-layout).
