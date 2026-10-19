# SAHAR FACE MOTION AI

A Hebrew (RTL) web platform for making AI videos: face swap, motion transfer, synthetic Hebrew voices, lip sync and video editing, with built-in consent management and AI-content labelling.

> **Status: Phase 2 of 8.** Accounts, the project library, real file uploads to S3-compatible storage, FFprobe validation and browser-friendly previews all work. The AI modules are not connected yet. The dashboard shows each module's real status and does not pretend to process anything. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Docs: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · [.env.example](.env.example)

## Requirements

- Node.js 22+
- PostgreSQL 16, Redis 7 (or Docker for `docker compose up`)
- FFmpeg + FFprobe on `PATH` (with libx264 and AAC; the stock Ubuntu/Debian/Homebrew builds have both)
- S3-compatible storage: MinIO locally (included in `docker compose`), or AWS S3 / Cloudflare R2. For a single machine you can also use `STORAGE_DRIVER=local`.

## Setup

```bash
cd sahar-face-motion-ai
npm install
cp .env.example .env
# set APP_SECRET:  openssl rand -hex 32

docker compose up -d            # Postgres + Redis + MinIO (or use your own services)
npx prisma migrate deploy       # create tables
npm run build && npm start      # web app on http://0.0.0.0:3000
npm run worker                  # media worker (second terminal): FFprobe checks + previews
# or: npm run dev               # development with hot reload (still run the worker)
```

There are two processes: the **web app** and the **media worker**. Uploaded files stay in "waiting for processing" until a worker is running. The status page (`/system`) shows whether one is.

## Checks

```bash
npm test          # unit + integration tests (vitest; runs real FFmpeg/FFprobe)
npm run lint      # ESLint
npm run typecheck # TypeScript

# also test the S3 driver against a real MinIO/S3:
S3_TEST_ENDPOINT=http://127.0.0.1:9000 npm test
```

### End-to-end tests

With the web app and worker running:

```bash
S3_TEST_ENDPOINT=http://127.0.0.1:9000 npm run test:e2e
```

These tests drive the app in an iPhone 14 Pro profile and a desktop profile:
- create a project;
- upload a JPG, an MP4, an iPhone-style HEVC `.mov` with rotation, an MP3 and a fake "MP4";
- wait for the worker to validate the files and build previews, and check that the fake file is rejected;
- check byte-range streaming, that another user gets no access, edit/duplicate/delete, and that storage objects are actually removed.

Playwright's open-source Chromium cannot decode H.264/AAC. When the browser lacks H.264, the test instead downloads the served previews and verifies them with FFprobe.

`GET /api/health` returns DB/Redis/FFmpeg readiness. Signed-in users can see detailed status, including AI providers, at `/system`.

## Opening on an iPhone

Nothing needs to be installed on the phone. Safari is enough.

**Option A: same Wi-Fi network (development).**
1. Run on a computer: `npm run build && npm start` (listens on `0.0.0.0:3000`) and, in a second terminal, `npm run worker`.
2. Find the computer's local IP (macOS: `ipconfig getifaddr en0`; Windows: `ipconfig`).
3. Set `APP_URL=http://<that-ip>:3000` in `.env` and restart.
4. On the iPhone, open Safari at `http://<that-ip>:3000`.
5. Optional: Share → "Add to Home Screen" to get an app-like icon. The app is set up for full-screen mode and the iPhone notch.

**Option B: public HTTPS deployment (recommended for real use).** Deploy the web app (for example Vercel, Render or Fly.io) with managed Postgres and Redis, set `APP_URL=https://…`, and open the URL in Safari. With HTTPS the session cookie is automatically `Secure`.

## How uploads work

1. The browser sends the file to `POST /api/projects/:id/assets`, using XHR for real upload progress.
2. The server streams it to disk. It enforces the type allow-list, the per-type size limit and the per-user storage quota, and computes a SHA-256.
3. The file is stored at `u/<user>/p/<project>/<asset>/original.<ext>`, and a `MEDIA_PROBE` job is queued (BullMQ).
4. The worker downloads the file and runs **FFprobe**. It rejects anything that is not real media of the declared kind, or that is too long, too small or too large.
5. The worker then creates browser-friendly derivatives with FFmpeg:
   - an H.264/AAC MP4 preview (short side ≤720 px, ≤30 fps, `+faststart`, iPhone rotation applied);
   - a JPEG poster;
   - a JPEG preview for images (this also handles HEIC where FFmpeg can decode it);
   - AAC for audio.
6. Files are served only to their owner through `GET /api/assets/:id/file`, which supports HTTP Range (Safari needs it for video).

## Responsible use

Using a person's face or voice requires their explicit consent. The app records consent, labels every AI output as synthetic, and does not allow cloning real people's voices without verified consent. Paid AI providers stay disabled until `ALLOW_PAID_PROVIDERS=true` **and** the user has a budget.

## Project layout

See [ARCHITECTURE.md §2](ARCHITECTURE.md#2-repository-layout).
