# Video face swap providers: comparison and recommendation (Oct 2026)

No accounts were created, nothing was purchased and no paid API was called.

**How this was checked:**
- Most vendor websites are blocked from the build environment. API details were therefore confirmed from each vendor's **official SDK source on GitHub** wherever possible.
- Prices, limits and terms come from vendor pages via search.
- **Unverified** marks anything that must be re-checked in the vendor dashboard before going live.

Assumed clip: 30 s at 30 fps = 900 frames.

| Provider | API confirmed from | Choose which person | Max length | 1080p | Commercial use | 30 s @1080p | 30 s @720p |
|---|---|---|---|---|---|---|---|
| **Magic Hour** ✅ recommended | official SDK `magic-hour-python` | yes: free face detection + `face_mappings` | plan-based (~11 min example) | yes (paid plans) | yes, on paid plans | **≈ $1.3–2.3** (900 credits) | same (priced per frame) |
| Akool Face Swap Plus (v4) | third-party OpenAPI profile + docs snippets | yes: detect + `face_mapping` | < 60 s advised | unverified | needs explicit permission of people shown | ≈ $1.5–1.8 (unverified) | same |
| WaveSpeed `video-face-swap` | official SDK `wavespeed-python` | `target_index` (by face size only) | 10 min | unverified | **model licence unknown** | $0.30 | $0.30 |
| fal `half-moon-ai/ai-face-swap/faceswapvideo` | fal-js client (field names unverified) | unverified | unverified | unverified | unverified | $0.72 | $0.72 |
| Segmind HyperSwap (FaceFusion Labs) | official SDK `segmind-python` | `target_face_index` | unverified | unverified | weight licence unclear | < $0.50 (unverified) | same |
| fal Pixverse swap | fal-js `endpoints.ts` | `keyframe_id` | unverified | **no (max 720p)** | unverified | n/a | ≈ $0.40 |
| fal Wan 2.2 Animate *replace* (generative) | fal-js | no (replaces whole character) | ~120 s | no (720p) | Apache-2.0 model | n/a | ≈ $2.4–4.5 |
| fal MiniMax H3 *recast* (generative, premium) | third-party pages | by reference photos | 30 s | yes | unverified | ≈ $13.50 | ≈ $9.00 (768p) |
| Replicate roop/inswapper models | Replicate API | no | — | yes | **no: InsightFace weights are non-commercial** | ≈ $0.15–0.50 | — |

## Quality on dance and motion videos

**Frame-by-frame swappers** (Magic Hour, Akool, HyperSwap, inswapper-class):
- Keep the original body motion, head motion and audio exactly, because only the face pixels change.
- They are the right tool for "my face on this dancer".
- The weak spots shared by all of them are near-profile head turns, hands crossing the face, and very fast spins. Expect occasional flicker there.
- Magic Hour's `v2` style is documented as "faster, sharper, better hair/glasses, stronger identity preservation".

**Generative replacers** (Wan Animate, H3 Recast):
- Re-render the person, so they hold up better through extreme motion.
- The cost is weaker exact likeness, lower resolution, and a much higher price.
- A possible premium "HQ" option later; not the default.

## Recommendation

**Primary: Magic Hour.**
- It is the only candidate whose full API was confirmed from official SDK source: upload URLs, free face detection, face swap and project polling.
- It supports choosing one dancer in a multi-person clip, which matches our picker UI.
- It offers 1080p on paid plans, allows commercial use on paid plans, and retains files only briefly.
- Its upload API means our storage does not need to be public.
- Implemented in `src/providers/face-swap/magichour.ts`, and verified with a contract test that uses the SDK's documented responses.

**Fallbacks:**
- **Akool v4:** similar price, has webhooks, but higher plan requirements and 60 s guidance.
- **WaveSpeed:** cheapest, but only if its model licence is confirmed in writing.
- **Self-hosted GPU worker:** adapter and HTTP contract already in place.

**Before going live, run a 5-clip bake-off** on real dance videos (2 providers × 5 clips ≈ $10–15) and compare identity, flicker and turns.

## Our 30-second estimate (what the app shows before approval)

| Clip | Frames sent | Magic Hour credits | Estimate at $0.0025/credit |
|---|---|---|---|
| 30 s @ 30 fps (1080p or 720p) | 900 | 900 | **$2.25** (upper bound) |
| 30 s @ 60 fps (iPhone default for some modes) | 900 (we cap at 30 fps) | 900 | **$2.25** (without the cap: $4.50) |
| 15 s @ 30 fps | 450 | 450 | $1.13 |

- The credit price depends on the plan you buy. Set `MAGIC_HOUR_USD_PER_CREDIT` to your plan's real price, and the app's estimates follow.
- After a job, the app records the provider-reported `credits_charged` as the actual cost.

## Sources
- Magic Hour SDK: https://github.com/magichourhq/magic-hour-python (`magic_hour/resources/v1/{face_swap,face_detection,files/upload_urls,video_projects}/README.md`, `environment.py`)
- Magic Hour commercial use: https://help.magichour.ai/en/articles/12613246-commercial-use-watermarks-and-your-rights · pricing: https://magichour.ai/pricing
- Akool: https://akool.com/api-pricing · OpenAPI profile: https://raw.githubusercontent.com/api-evangelist/akool/main/openapi/akool-face-swap-api-openapi.yml
- WaveSpeed: https://github.com/WaveSpeedAI/wavespeed-python · https://wavespeed.ai/models/wavespeed-ai/video-face-swap
- fal: https://github.com/fal-ai/fal-js · https://fal.ai/models/half-moon-ai/ai-face-swap/faceswapvideo · https://fal.ai/models/minimax/h3-max/recast
- Segmind: https://github.com/segmind/segmind-python · https://www.segmind.com/models/video-faceswap-by-facefusion-labs/api
- InsightFace licence (inswapper non-commercial): https://github.com/deepinsight/insightface
