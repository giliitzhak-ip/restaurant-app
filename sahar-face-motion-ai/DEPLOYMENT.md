# Running in the cloud (iPhone only, no computer needed)

To use the app from an iPhone without keeping a computer on, deploy it once to a hosting service. After that you just open a URL in Safari and add it to the Home Screen. Everything below can be done from a browser.

## What you need (accounts to open; none were opened for you)

| Piece | Suggested service | Notes |
|---|---|---|
| Web app + worker (two containers from the same `Dockerfile`) | Render, Railway or Fly.io | Web: `npx next start …` (default CMD). Worker: `npm run worker`. The worker needs ~1 GB RAM. |
| PostgreSQL | the host's managed Postgres, Neon or Supabase | `DATABASE_URL` |
| Redis | the host's managed Redis or Upstash | `REDIS_URL` |
| File storage | Cloudflare R2 (no egress fees) or AWS S3 | `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, keys; `S3_CREATE_BUCKET=false` |
| Face swap | Magic Hour API key + paid plan | `FACE_SWAP_PROVIDER=magichour`, `MAGIC_HOUR_API_KEY`, `MAGIC_HOUR_USD_PER_CREDIT` = your plan's price |

## Steps

1. Create the Postgres, Redis and bucket. Copy their connection values.
2. Create two services from this repository folder (`sahar-face-motion-ai/`, built with the `Dockerfile`). Use the same environment variables for both, from `.env.example`:
   - `APP_URL=https://<your-domain>` (HTTPS makes the session cookie `Secure`)
   - `APP_SECRET=<openssl rand -hex 32>`
3. Set the worker service's start command to `npm run worker`.
4. Open `https://<your-domain>/system` and check that everything is green: database, Redis, storage, worker, FFmpeg and face detection.
5. Turn on paid face swap only when you're ready:
   - `ALLOW_PAID_PROVIDERS=true` on the server;
   - a monthly budget in **החשבון שלי**, which defaults to $0, i.e. blocked;
   - every job still shows its cost and needs an explicit approval tap.
6. On the iPhone, open the URL in Safari, then Share → **Add to Home Screen**.

## Cost guards that stay active in production
- `ALLOW_PAID_PROVIDERS` is a global kill switch.
- Each user has a monthly budget they set themselves, capped by `MAX_USER_MONTHLY_BUDGET_USD`.
- `MAX_JOB_COST_USD` is a hard ceiling per job, and there is a daily job limit per user.
- The quote is valid for 30 minutes. Approval must match the quoted amount exactly, and a double tap cannot approve twice.
- A job is never re-submitted after a worker restart: polling resumes from the saved provider job id.

> The Dockerfile was written for this deployment but could **not** be built in the development environment, because Docker Hub is blocked there. Build it once on the host, and check `/system` after the first deploy.
