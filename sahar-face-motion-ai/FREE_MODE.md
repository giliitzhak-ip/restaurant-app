# Running SAHAR FACE MOTION AI for free

Goal: a first face-swap video at **$0**, from an iPhone, without a personal computer.
Researched Oct 2026. **[V]** = verified in official source or docs; **[S]** = from vendor pages via search, re-check before relying on it.

## Free Mode (on by default)

`FREE_MODE=true` (the default) makes paid usage impossible:
- **Free engines run normally:** `facefusion-local` and `mock`.
- **A paid provider is allowed only when all of these hold** (checked at quote time, at approval time, and again by the worker right before the call):
  - the account is on the **free tier**;
  - it has **no subscription**;
  - its **remaining credits cover the whole job**.

  Magic Hour exposes this through `GET /v1/account` **[V]**. If the balance can't be read, the job is blocked.
- `ALLOW_PAID_PROVIDERS` and user budgets are ignored. Recorded money cost is always $0; credits used are logged separately.
- The header shows a green **מצב חינמי** badge. `/system#free-mode` lists each engine and the remaining credits.

Turning Free Mode off is a deliberate server setting, and paid jobs still need a budget plus explicit per-job approval.

## Options for a free first video

| Option | Cost | Limits | Commercial use | Notes |
|---|---|---|---|---|
| **A. FaceFusion locally (open source)** | $0 | CPU speed: roughly 3–10 min per 10 s of video on 2 vCPU **[S]**; ~2–4 GB RAM | only with `ghost_*` models (Apache-2.0) **[V]** | No credits, no account. Runs inside GitHub Codespaces (below). |
| **B. Magic Hour free credits** | $0 | **400 free credits** on sign-up, no card **[S]**; 1 credit/frame, so ≈ **13 s at 30 fps**, 16 s at 24 fps, 26 s at 15 fps; output **576px** on free **[V]** | **no** on the free plan **[S]** | Higher quality, fast. The app trims the clip and lowers fps to fit the credits. |
| C. Mock | $0 | not a real swap | — | Tests the UI and flow only; output is labelled TEST. |

### FaceFusion swapper models and licences
Source: `facefusion/processors/modules/face_swapper/core.py` **[V]**.

| Model | Licence | Commercial? |
|---|---|---|
| **ghost_1_256 / ghost_2_256 / ghost_3_256** (our default: ghost_1_256) | Apache-2.0 | **yes** |
| hyperswap_1a/1b/1c_256 (FaceFusion's default) | ResearchRAIL | no |
| inswapper_128 / fp16 | Non-Commercial | no |
| simswap_256, blendswap_256, alphaface_256 | Non-Commercial | no |
| uniface_256, hififace | unknown | avoid |

The FaceFusion code itself is OpenRAIL-AS (use restrictions apply). Hardware: CPU works, an NVIDIA GPU is much faster. Free GPU notebooks are not an option: Google Colab bans deepfake generation on free runtimes **[S]**.

### Free hosting (findings)

| Host | Free? | Card? | Fit |
|---|---|---|---|
| **GitHub Codespaces** | monthly free quota for personal accounts (about 120 core-hours, i.e. ~60 h on 2 cores, plus 15 GB; check under GitHub → Settings → Billing) | no | **Best fit:** full Linux with Docker-like setup, runs everything (DB, Redis, FFmpeg, FaceFusion), and opens in iPhone Safari via a forwarded port. Stops when idle. |
| Hugging Face Spaces (Docker) | **no longer free** for Docker/Gradio Spaces **[V]** | — | — |
| Render / Koyeb free | 512 MB RAM, no background workers **[S]** | varies | too small for the worker |
| Oracle Always Free | ~2 OCPU / 12 GB **[S]** | **yes** | good VM, needs a card |
| Cloud Run | free tier **[S]** | **yes** (billing account) | — |
| Vercel Hobby + Supabase + Neon | free **[S]** | no | web only; can't run FFmpeg/FaceFusion workers |
| Upstash Redis free | 500K commands/month **[S]** | no | BullMQ polling would use it up in about a week |
| Cloudflare R2 | 10 GB free **[S]** | **yes** | — |

**Recommendation:** GitHub Codespaces + FaceFusion (`ghost_1_256`) for unlimited free swaps, plus Magic Hour free credits for a short high-quality test. Nothing here requires a card.

## Step by step from the iPhone (Codespaces)

1. In Safari, open the repository on github.com. Tap **Code → Codespaces → … → New with options**. Choose the configuration **"SAHAR FACE MOTION AI"** and machine type **2-core**, then create.
2. Wait for setup. The first time takes about 10–20 minutes: it installs PostgreSQL, Redis, FFmpeg, Python/OpenCV, the app and FaceFusion.
3. When port **3000** appears under **Ports**, open it. It's private to your GitHub login. Register an account in the app.
4. Create a project, then **החלפת פנים**:
   - upload a face photo and a short dance clip;
   - pick the person;
   - in **קטע ואיכות**, choose 5–10 s and 15–24 fps;
   - choose the engine **FaceFusion (קוד פתוח, חינמי)**;
   - approve ($0).
5. Wait for the job, then watch before/after and download.
6. When finished, **stop the codespace** (github.com/codespaces → … → Stop) to save the free quota.

To use Magic Hour's free credits as well:
1. Sign up at magichour.ai/developer (no card) and create an API key.
2. In the codespace terminal, add `MAGIC_HOUR_API_KEY=...` to `sahar-face-motion-ai/.env`.
3. Restart with `bash sahar-face-motion-ai/scripts/codespace-start.sh`.

The studio then shows the remaining credits and only allows jobs that fit them.

## Not verified here
- The development environment cannot reach Hugging Face, GitHub releases or Codespaces. So FaceFusion's real models, the Codespaces setup scripts and the Magic Hour API were **not run end-to-end**.
- What *is* tested:
  - our FaceFusion adapter against a stand-in CLI (exact arguments, person selection, progress);
  - the Magic Hour account/credit and upload/submit flow against a fake server that uses the SDK's documented responses;
  - the full studio flow with the mock engine.
- The first real FaceFusion run in Codespaces downloads models from GitHub releases, which is allowed there.
