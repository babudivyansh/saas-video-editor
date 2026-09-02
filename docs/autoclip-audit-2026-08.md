# AutoClip — End-to-End Audit & Implementation Blueprint

**Date:** 2026-08-06 · **Branch audited:** `main` @ `48e8963` · **Scope:** every AutoClip file in the repo (frontend, API, pipeline, reframe, render, scoring, queue, schema, admin).

**Method:** every claim about *our* system below is read directly out of the code and cited `file:line`. Two claims were verified by executing FFmpeg locally rather than reasoning about it (§3.1). Competitor claims are drawn from public documentation and third-party review coverage, dated and sourced in §7 — I did not have access to paid accounts, so I have **not** measured competitor output quality, and I say so where it matters rather than guessing.

---

## 1. Executive summary

AutoClip is substantially more complete than a typical v1. It has a real two-phase pick → review → render flow, credits that are only charged for clips the user keeps, durable BullMQ queues with tier priority, an STT provider with fallback, Rekognition-backed speaker tracking with an active-speaker signal, split-screen for two-person scenes, silence/filler removal with correct time-base re-shifting, per-clip ASS caption styling with account-level Brand Kits, auto B-roll, mood-driven color grading, calibrated virality scoring with admin-tunable weights, dubbing, direct YouTube publishing, and a partial-failure refund path. The engineering quality of the *bookkeeping* (credits, idempotency guards, refunds, transactional writes) is genuinely above market norm.

The problems are concentrated in three places:

1. **The cinematic layer does not actually work.** Every zoom in the product — hook punch-in, question/emotion zoom, cinematic Ken Burns, and the mood zoom envelope — is a no-op. FFmpeg's `crop` filter evaluates its `w`/`h` expressions **once at configuration time**, where `t` is unavailable; the generated nested-`if` expression silently collapses to the *final* keyframe's value and stays there for the whole clip. Verified by execution (§3.1). Panning works; zooming has never worked. This is the single highest-value fix in the document, and it is also the reason the feature "feels static" next to Opus Clip regardless of how the sliders are set.

2. **Two correctness bugs that produce failed or misframed renders**: changing a clip's aspect ratio in the Review step reuses crop keyframes computed for the *old* aspect (§3.2), and the Studio "Apply" buttons trigger unlimited free re-renders with no charge and no counter (§3.3, also a cost-abuse hole).

3. **The long-form path — the actual podcast/webinar use case the tier caps sell — degrades silently.** Rekognition polling is capped at 5 minutes, so speaker tracking quietly disables itself on exactly the 2–6 hour sources paid tiers advertise (§3.5); the Gemini prompt sends one timestamp per word, which is roughly 200k+ tokens on a 6-hour transcript (§3.6); and `faceTimeline` for such a video is a six-figure-element JSON blob stored on a Postgres column (§3.7).

Fixing #1 and #2 is roughly two weeks of focused work and moves output quality from "static crop with captions" to "competitive with Opus Clip's reframe". Everything after that is differentiation.

**Honest positioning today:** on *pipeline plumbing and billing fairness* we are at or above market. On *output motion design* — the thing a creator actually sees — we currently ship a static crop, which is behind every product in §7. The gap is not architectural; it is one filter graph.

---

## 2. Current feature inventory (what exists, verified)

Everything in this table is implemented and reachable in the product today.

### 2.1 Ingest & job orchestration
| Capability | Where | Notes |
|---|---|---|
| Upload (drag/drop, 500 MB cap, MIME allowlist) | `app/api/upload/route.ts:29`, `app/dashboard/create/auto-clip/page.tsx:882` | SHA-256 dedupe, storage quota per tier, asset moderation enqueued |
| Multipart upload endpoint | `app/api/upload/multipart/` | exists; the AutoClip UI does **not** use it (§4.1) |
| Project create → pick enqueue | `app/hooks/useVideoGenerate.ts:298`, `app/api/generate/auto-clip/route.ts:77` | |
| Durable queue, retries, tier priority | `lib/render-queue.ts:115` | BullMQ, `attempts:3`, exponential backoff, `RENDER_CONCURRENCY` default 2 |
| In-process fallback driver | `lib/render-queue.ts:105` | |
| Worker heartbeat / admin ops visibility | `lib/worker-heartbeat.ts`, `KNOWN_RENDER_QUEUE_NAMES` | |
| Double-submit guard (status-transition claim) | `route.ts:69`, `confirm/route.ts:91`, `rerender/route.ts:49` | correct pattern, applied consistently |
| Tiered source-length cap 30 m → 6 h | `lib/plans/tiers.ts:90`, enforced `autoclip-pipeline.ts:400` | |
| Free tier: 2 runs / 30 days, watermark + 720p | `tiers.ts:98`, `autoclip-pipeline.ts:744` | |
| Rate limit 10 req/min/user | `route.ts:102` | |

### 2.2 AI pipeline
| Capability | Where | Notes |
|---|---|---|
| STT with fallback provider | `lib/transcription.ts:53` | ElevenLabs Scribe → OpenAI Whisper; word-level timings |
| Highlight selection (Gemini 2.5 Flash) | `autoclip-pipeline.ts:193` | single call, JSON array |
| Structured sub-scores: hook / pacing / payoff / engagement | `:212` | 0–99 each |
| Mood classification (5 classes) → color grade | `:214`, `MOOD_TO_FILTER:61` | vivid / softGlow / noir / warm / none |
| Auto title (hook-style, ≤60 ch) | `:209` | |
| Auto caption + hashtags | `:223` | copy-to-clipboard in Studio drawer |
| Audience / platform / posting-time suggestion | `:220` | |
| Reasoning, hook explanation, retention prediction (prose) | `:217` | LLM prose, not a model |
| Deterministic non-overlap enforcement | `enforceNonOverlapping:310` | good backstop for LLM drift |
| Face timeline (Rekognition Video, `FaceAttributes: ALL`) | `lib/reframe.ts:58` | cached on `Project.faceTimeline`, run concurrently with STT+Gemini (`:439`) |
| Active-speaker signal via `MouthOpen` | `reframe.ts:358` | with area fallback + 0.25 s hysteresis |
| Calibrated virality score | `lib/virality-score.ts:59` | LLM 0.55 / dynamic-range 0.2 / speech-rate 0.15 / silence 0.1, admin-overridable |
| Weight recalibration from real engagement | `lib/virality-calibration.ts` | fed by `ClipPublish` |

### 2.3 Framing & motion
| Capability | Where | Status |
|---|---|---|
| Static center crop (fallback) | `autoclip-pipeline.ts:51` | works |
| Single-speaker pan tracking | `reframe.ts:248` `computeAdvancedCrop` | **works** (x/y are per-frame) |
| Eye-line / headroom composition | `reframe.ts:455` | eyes placed at 35% of frame height, clamped |
| Smoothing controls (box filter + EMA + pan-rate clamp) | `reframe.ts:405-427` | driven by `smoothness` / `trackingSpeed` sliders |
| Two-speaker split-screen (vstack) | `reframe.ts:547`, `:670` | works; gap-split clustering, ≥0.25 separation, ≥40% coverage both sides |
| Active-speaker cutting between two people | `reframe.ts:344` | works |
| Reframe presets (balanced/minimal/dynamic/cinematic) | `reframe.ts:229` | pan params only |
| Hook zoom / question zoom / emotion zoom | `reframe.ts:271-303` | **computed but never rendered** — §3.1 |
| Cinematic Ken Burns | `reframe.ts:183`, `:298` | **no-op** — §3.1 |
| Mood zoom envelope | `buildZoomEnvelope:653` | **no-op** — §3.1 |

### 2.4 Editing, captions, output
| Capability | Where | Notes |
|---|---|---|
| Review step: keep/drop, trim in/out, per-clip aspect | `page.tsx:275`, `confirm/route.ts` | charged only for kept clips |
| Source-scrub preview in review | `TrimmedPreviewPlayer:149` | previews *source*, not final framing |
| Silence removal (word-gap based, tunable threshold) | `computeKeeps:642` | |
| Filler removal (unigram + bigram list) | `:630`, `:636` | |
| Correct re-timing of words + keyframes after cuts | `shiftTime:724`, applied `:787-823` | genuinely well done |
| Burned-in ASS captions, 16 presets | `utils/ffmpeg-render.ts:448` | |
| Karaoke `\kf` mode + word-highlight "animated" mode | `ffmpeg-render.ts:86`, `:125` | animated = 4 words/line, active word 118% + colour |
| Per-clip style override (font, 4 colours, outline, shadow, box, alignment) | `page.tsx:1586` | |
| Brand Kits (account-level saved styles) | `page.tsx:1330`, `/api/brand-kits` | |
| Interactive transcript editor → re-render | `page.tsx:1741`, `transcript/route.ts` | |
| Auto B-roll (Pexels, one 2.5 s window, LLM-placed) | `lib/broll.ts`, `buildBrollFilterComplex:602` | |
| Per-clip thumbnail | `autoclip-pipeline.ts:917` | midpoint frame, 480 px |
| Progress: real FFmpeg `time=` parsing → `Clip.progress` | `ffmpeg-render.ts:279`, `:911` | |
| Free-tier watermark + 720p cap | `watermarkFilterChain:744` | applied last, unccroppable |
| Single-clip re-render (reuses transcript/faces) | `rerenderJob:1063` | first per clip free |
| Dubbing | `lib/autoclip-dub.ts`, `ClipDub` | |
| Publish: YouTube direct upload; others = paste permalink | `lib/autoclip-publish.ts`, `page.tsx:472` | Meta app review not completed — stated honestly in UI |
| Hand-off to full editor | `edit-in-editor/route.ts` | creates editor project + asset |
| Partial-failure refund (proportional) | `autoclip-pipeline.ts:1017` | |
| Trimmed-duration refund | `:1033` | refunds the 2-min blocks auto-trimming removed |
| Analysis charge credited against confirm | `:114`, `confirm/route.ts:84` | |
| Admin pricing + calibration + failed-job console | `/api/admin/autoclip-pricing`, `/autoclip-calibration` | |
| Public API v1 | `/api/v1/projects`, `/api/v1/clips` | |

### 2.5 Explicitly **not** implemented
Scene / shot-boundary detection (nothing anywhere in the repo) · eye tracking · object or scene semantic awareness · rule-of-thirds horizontal composition (vertical eye-line only) · group (3+) speaker layouts · emoji / sticker overlays · caption templates beyond the 16 colour presets · music bed or ducking on AutoClip output (`lib/audio-ducking.ts` exists but is not wired into this pipeline) · transitions · motion graphics / lower-thirds / progress bars · speed ramping · rotate / blur / mask · manual timeline for a clip · multi-clip bulk export or ZIP · scheduling / auto-posting · YouTube-or-URL import (upload only) · retention curve modelling · A/B variant generation · translated (as opposed to dubbed) captions.

---

## 3. Bugs & technical defects, by severity

### 3.1 🔴 CRITICAL — every zoom is a no-op (verified by execution)

`buildDynamicCropFilter` (`lib/reframe.ts:625`) emits, when keyframe sizes vary:

```
crop=w='<nested if(lt(t,…)) chain>':h='…':x='…':y='…',scale=1080:1920
```

The comment at `reframe.ts:630` states *"No `eval` option exists on the crop filter — its x/y/w/h expressions are already re-evaluated every frame"*. That is half right. I tested it:

```
# x varying with t  → per-frame (YAVG climbs 12 → 20 → 28 → 36 …) ✔ panning works
# w = '128-t*32'    → "Error when evaluating the expression" → render FAILS
# w = 'if(lt(t,0.5),(0.5*in_w+…),(0.4*in_w))' with in_w=640
#                   → succeeds, output is 256x324 — i.e. frozen at 0.4*in_w, the
#                     ELSE branch, for the entire clip.
```

`w`/`h` are evaluated **once at filter-configuration time**, where `t` is not a valid variable. The nested-`if` form doesn't error — it silently takes the final branch and holds it. Consequences:

- **Smart zoom, hook punch-in, question zoom, emotion zoom: no visible motion.** In smart mode `extraZoom` returns to 1.0 by the end of the clip, so the frozen value is scale 1.0 — the output is identical to a static crop, plus a pointless crop→scale re-encode.
- **Cinematic preset:** freezes at the *end* of the Ken Burns ramp, so the whole clip is uniformly 12% tighter. A permanent static zoom-in, not a movement.
- **Mood zoom envelope** (`buildZoomEnvelope`): starts and ends at scale 1.0, so it freezes at 1.0. Completely inert.
- **Split-screen with cinematic preset** (`buildSplitScreenFilterComplex:682`): same defect.
- Any future expression that isn't a `lt()` chain (a plain arithmetic ramp) will **hard-fail the render**, as the second test shows.

This also explains why the `zoomStrength` control has no perceptible effect and why unit tests never caught it — `lib/reframe.test.ts` asserts on the generated *string*, and no test executes FFmpeg.

**Fix (production-ready):** `crop` cannot do this. Use `zoompan`, which evaluates `z`, `x`, `y` per output frame:

```
crop=w=<constant, the WIDEST window the path needs>:h=<constant>:x='<pan expr>':y='<pan expr>',
zoompan=z='<scale expr in terms of on/fps>':x='…':y='…':d=1:s=1080x1920:fps=30
```
Constant-size crop keeps the pan (which already works and is smooth), and `zoompan` layers the zoom on top. Two caveats to handle in implementation: `zoompan` rounds `x`/`y` to integers, which causes visible 1-px jitter on slow moves — mitigate by pre-scaling the intermediate to ~2× target and letting the final `scale` absorb the rounding; and `zoompan` counts output frames (`on`), so convert keyframe `tSec` to `on/fps` at build time. Add an **execution-level test**: render 10 frames through the real generated filter graph and assert output dimensions and frame-to-frame difference. That test is what prevents this class of bug from recurring.

### 3.2 🔴 CRITICAL — changing aspect ratio in Review renders with stale crop keyframes

`computeStoredCrop` runs at pick time with the *project's* aspect (`autoclip-pipeline.ts:497`). The Review step lets the user change aspect **per clip** (`page.tsx:257`), and `confirm/route.ts:132` writes the new `aspectRatio` without clearing `cropKeyframes`. `renderOneClip` then calls `buildDynamicCropFilter(keyframes, aspect)` (`:898`) with x/y fractions computed for a 9:16-wide window applied to a 16:9-wide window. Best case the framing is wrong; worst case `x + w > 1` and FFmpeg aborts with an invalid crop size, failing the clip *after* the user was charged. The `rerender` route gets this right for changed start/end (`rerender/route.ts:106`) but not for changed aspect. **Fix:** null `cropKeyframes` whenever `aspectRatio` changes, in both routes; better, recompute from the cached `faceTimeline` (it's already on the Project, so this is cheap).

### 3.3 🟠 HIGH — Studio "Apply" = unlimited free renders (cost-abuse hole)

`style/route.ts` and `transcript/route.ts` both enqueue `rerenderJob` with **no credit charge and no `rerenderCount` increment**. `rerender/route.ts` charges properly and increments. So a user who clicks "Apply Subtitle Styles" repeatedly gets unbounded free FFmpeg renders + S3 writes. There is no rate limit on these two routes either (unlike `/api/generate/auto-clip`, which has `withRateLimit`). **Fix:** route all three through one shared `chargeAndQueueRerender()` helper with the free-first-render rule and a rate limit.

### 3.4 🟠 HIGH — re-render failures are never refunded

`rerender/route.ts:69` charges before enqueuing. `rerenderJob` (`:1063`) calls `renderOneClip`, which swallows its own error and marks the clip `failed` (`:954`). Nothing refunds. The batch path handles this correctly (`:1017`) — the single-clip path does not.

### 3.5 🟠 HIGH — speaker tracking silently disables itself on long videos

`MAX_POLL_MS = 5 * 60 * 1000` (`reframe.ts:44`). On timeout it logs a warning and returns `[]` (`:88`), which becomes the `reframe_unavailable` warning banner. Rekognition Video on a 2–6 hour source will routinely exceed 5 minutes — meaning the podcast/webinar customer, who is exactly who the Creator/Pro/Studio source caps are sold to, gets a centre crop. It also burns a worker slot for 5 minutes doing nothing but polling. **Fix:** move to the SNS/SQS completion channel Rekognition provides (`NotificationChannel` on `StartFaceDetection`), persist the JobId on the Project, and make the pick job resumable — no polling, no worker occupancy, no cap.

### 3.6 🟠 HIGH — Gemini prompt does not scale to the advertised source lengths

`autoclip-pipeline.ts:453` builds the transcript as one `[12.34] word` token *per word*. A 6-hour talk is ~55–65k words → well over 200k tokens of mostly timestamps, in a single call, with a 30 s timeout and one retry (`:254`). It will truncate, degrade, or fail. **Fix:** sentence- or phrase-level timestamps (10–20× fewer tokens), plus a map-reduce pass for sources over ~45 minutes: score windows independently, then rank globally. Also move to Gemini's structured-output/JSON-schema mode and drop the `/\[[\s\S]*\]/` regex parse (`:256`).

### 3.7 🟡 MEDIUM — `faceTimeline` as a JSON column doesn't scale
Rekognition samples several times per second; a 6-hour video yields well into six figures of `FaceBox` objects, written to and re-read from a Postgres `Json` column (`schema.prisma` `Project.faceTimeline`) and held in worker memory in full (`:439`, `:1076`). **Fix:** store to S3 as a compressed sidecar, keep a pointer in the DB; or downsample to 5 Hz and quantize to 3 decimal places before persisting (≈70% smaller with no perceptible tracking loss).

### 3.8 🟡 MEDIUM — filter-expression blowup
`computeAdvancedCrop` steps every 0.1 s and merges with `MERGE_EPS = 0.005` (`reframe.ts:472`) — half a percent of frame width. On a moving subject that retains a large fraction of the 600 keyframes in a 60 s clip, each becoming one nesting level in `lerpExpr` (`:604`), across 2–4 expressions. The result is a multi-hundred-KB filter string evaluated per frame per axis. This is a real CPU cost and an argv-length risk on long clips. **Fix:** raise `MERGE_EPS` to ~0.02, cap keyframes (Douglas–Peucker simplification to ≤40 points), and pass the graph via `-filter_complex_script` instead of argv.

### 3.9 🟡 MEDIUM — B-roll silently disables all reframing
`autoclip-pipeline.ts:497`: `const cropKeyframes = broll ? null : computeStoredCrop(...)`. Any clip that gets a 2.5 s stock insert loses speaker tracking for its entire duration. The comment acknowledges this as a deliberate simplification; it is now the wrong trade, because the B-roll segments A and C are ordinary crops in the same graph and can carry the same dynamic expressions.

### 3.10 🟡 MEDIUM — non-retryable failures are retried three times at full cost
`pickJob` rethrows everything (`:587`) so BullMQ retries — including "video too short", "exceeds your plan's length", and "not enough credits". Each retry re-downloads the entire source and re-runs Rekognition. **Fix:** a `NonRetryableError` class checked in the queue wrapper.

### 3.11 🟡 MEDIUM — `void queue.add(...)` swallows enqueue failures
`render-queue.ts:134`. `confirm/route.ts` charges credits and then fire-and-forgets the enqueue; if Redis is unavailable the user is charged and nothing ever renders, with no error surfaced. **Fix:** await the add, refund on failure.

### 3.12 🟡 MEDIUM — unvalidated user input reaching the ASS writer
`style/route.ts` validates the reframe enums carefully but merges `subtitleStyleOverride` verbatim (`:66`). `fontSize` is written straight into the ASS header (`ffmpeg-render.ts:80`) — a 1e9 value is a libass memory bomb. `transcript/route.ts` accepts any array of any length, and word text is written into the ASS `Dialogue:` line unescaped (`:118`, `:136`), so `{\p1}` or a newline in a word injects ASS override tags. Not RCE (nothing reaches a shell), but it breaks renders and is trivially fuzzable. **Fix:** zod-validate both payloads; clamp numerics; strip `{`, `}`, `\` and newlines from word text.

### 3.13 🟢 LOW
- No `-movflags +faststart` and no explicit `-pix_fmt yuv420p` on output (`:851`) — slow web playback start; compatibility risk from unusual source pixel formats.
- `analyzeAudio` (`:924`) fully re-decodes each rendered clip purely for scoring; fold it into the render pass with `-af astats` metadata instead.
- Clips are rendered **serially** inside one job (`:998`) — 20 clips is one long tail on one worker with `RENDER_CONCURRENCY=2`. Fan out per-clip jobs.
- Source video is re-downloaded for pick, for render, and again for *every* re-render. Cache it on the worker keyed by project.
- `os.tmpdir()` shared across concurrent jobs with no per-job directory; cleanup only in `finally`, so a `SIGKILL`ed worker leaks whole video files.
- `rerenderQueue.enqueue(\`${clipId}-${Date.now()}\`)` — the timestamped jobId defeats BullMQ deduplication.
- No CPU/GPU encoder selection: `libx264 -preset superfast -crf 23` everywhere, no NVENC/QSV path.

---

## 4. UX / UI audit

### 4.1 Upload
Single `POST /api/upload` with the whole file in one request body (`useVideoGenerate.ts:11`) for files up to 500 MB — no chunking, no resume, and **no upload progress**: the UI shows a spinner and "Uploading your video…" with no percentage. A multipart endpoint already exists in the repo and isn't used here. No URL import (YouTube/Drive/Dropbox), which every competitor in §7 offers and which is the single most common first action for podcast clippers.

### 4.2 The cost blindness problem (highest-impact UX fix)
The user never sees a price. Not on the settings step, not on the Review step, not on the Confirm button. `computeCreditCost` is server-only; the client discovers the cost only by getting a 402 back (`page.tsx:306`). The Review step's own copy promises *"you're only charged for what you keep"* — while showing no number for what's kept. **Fix:** live cost estimate in the Review header that recomputes as clips are toggled and trimmed, plus the analysis credit shown as an applied discount. This is a trust feature, not a convenience feature.

### 4.3 Review step
No WYSIWYG. `TrimmedPreviewPlayer` streams the **original source** (`:149`) — the user reviews content and timing but cannot see the reframe, the captions, the grade, or the B-roll they are about to pay for. Trimming is two number inputs, not a scrubber or waveform. There is no transcript view at review time, so "does this clip end on a complete thought" — the single most common reason to adjust a clip — can't be judged without playing it. And each card mounts its own `<video src={fullSourceUrl}>`; six cards playing a 500 MB source is six independent range-request streams.

### 4.4 Results grid
No search, no filter, no bulk select, no download-all/ZIP, no "delete clip". Polling hits `/api/projects/{id}/clips` every 2.5 s and never stops until `completed`/`failed`. Skeleton count comes from local state, so a resumed session (`?project=`) shows one skeleton regardless of actual clip count.

> **Correction (2026-08-07, found during implementation).** This section originally claimed the poll payload ships `transcriptJson` for every clip, and that clips are ordered by `index` rather than score. Both were wrong: the route orders by `score desc` already, and it selects *neither* `transcriptJson` nor `subtitleStyleOverride`/`silenceSettings`. The real defect is the opposite one — `ClipEditorDrawer` reads all three fields, so the Transcript tab always rendered an **empty word list** and the Style tab always showed defaults instead of the clip's saved style. Fixed by adding the small settings blobs to the list payload and fetching the transcript on drawer open via `?clipId=`, which keeps the 2.5 s poll lean.

### 4.5 Studio drawer
Good information density; the Insights tab is genuinely a differentiator. But every "Apply" is **destructive and immediate** — it overwrites the existing render with no preview, no undo, no version history, and (§3.3) no cost signal. The transcript editor renders one `<input>` per word with a fixed `w-16` width, which breaks for long words and is unusable for a 60-second clip's ~150 words. There is no timeline, no waveform, and no per-word timing adjustment — only spelling.

### 4.6 Mobile
The results grid is `grid-cols-2` on mobile with 9:16 cards — roughly 90 px wide previews. The Studio drawer is `max-w-lg` sliding from the right, so on a phone it is a full-screen takeover with no swipe-to-dismiss. The stepper scrolls horizontally, which is handled well. Overall: usable, not designed-for.

### 4.7 Error & empty states
`WARNING_COPY` (`:76`) covers two warnings with clear, honest, non-technical copy — this is good work and should be the template. Everything else is generic: `"We couldn't generate clips from this video. Please try again."` — no distinction between "too short", "over your plan limit", "transcription failed", or "Gemini returned nothing", even though the pipeline throws distinct, user-appropriate messages for each. They're thrown into the queue and never make it back to the client, because the client only ever sees `project.status === "failed"`. **Fix:** persist the failure reason on the Project and surface it.

### 4.8 Recommended visual direction
Against the Linear/Vercel/Framer reference set, and staying inside the shipped vibrant-gradient system (`app/globals.css`, `app/components/ui/`) rather than inventing a second one:

- **Progress as narrative, not spinner.** The pipeline already has real stages (`RenderStage`) — transcribing → finding moments → tracking speakers → rendering. Show them with elapsed time per stage. A 6-hour analysis behind one spinner feels broken; behind a staged list it feels like work being done.
- **Clip cards should lead with the score** as a ring (the `CreditRing` primitive already exists), sorted descending, with the hook line as the headline.
- **Review as a filmstrip**, not a grid of number inputs: waveform + transcript under a scrubber, drag handles for in/out, keyboard `[` `]`.
- **Motion budget:** entrance transitions ≤200 ms, `prefers-reduced-motion` respected, no animation on the polling path (currently every 2.5 s tick re-renders the whole grid).

---

## 5. Smart editing capability matrix

| Capability | AutoClip today | Present elsewhere in repo | Gap |
|---|---|---|---|
| Trim (in/out) | ✅ review + re-render | editor timeline | — |
| Split | ❌ | editor | port |
| Merge / stitch clips | ❌ | editor | port |
| Crop / reframe | ✅ auto only | editor manual | no manual override of the AI crop |
| Zoom | ⚠️ **broken** (§3.1) | — | fix + make it manual-adjustable |
| Rotate | ❌ | — | low value |
| Blur (background / face) | ❌ | — | face blur is a real privacy ask |
| Speed / ramping | ❌ | editor | port |
| Music bed + ducking | ❌ in AutoClip | `lib/audio-ducking.ts` unused here | wire it up — cheap win |
| Captions | ✅ strong | shared | see §7 gap: no templates/emoji |
| Fonts | ✅ 6 in drawer, 16 presets | `resolveFontFile` | needs a real font picker + upload |
| Colours | ✅ 4 channels | — | — |
| Branding / logo overlay | ❌ (Brand Kits are caption-only) | — | logo + colour + font kit |
| Watermark | ✅ free-tier enforcement | — | user-supplied watermark missing |
| Transitions | ❌ | editor | for B-roll cuts especially |
| Motion graphics / lower-thirds | ❌ | — | biggest visual differentiator gap |

---

## 6. Motion, zoom and caption engines — design

These three sections answer Phases 6, 7 and 8. They share one prerequisite: **a signal track**, which does not exist today.

### 6.1 The missing primitive: a per-frame signal track
Everything cinematic depends on knowing, per 50 ms, how loud / how fast / how emphatic the speech is. Today the pipeline measures audio exactly once, globally, after render (`analyzeAudio`), producing three scalars. Build instead, during the pick job (the audio is already extracted at `:446`):

| Signal | How | Cost |
|---|---|---|
| RMS envelope @ 50 ms | `ffmpeg -af astats=metadata=1:reset=1 -f null -` + metadata parse | one extra audio-only pass, seconds |
| Pitch (F0) contour | YIN/autocorrelation on 16 kHz mono in Node, or `aubio` | seconds, no dependency on a service |
| Speaking rate | already derivable from word timings | free |
| Pause map | already computed by `computeKeeps` | free |
| Emphasis / keyword tags | ask Gemini for word indices in the existing call — it already returns 12 fields, one more array is free | free |
| **Shot boundaries** | `ffmpeg -vf "select='gt(scene,0.4)',metadata=print"` | **currently absent entirely** |

Normalize each to 0–1 per clip (relative to that clip's own distribution — absolute dB is meaningless across sources) and persist as `Clip.signalTrack`.

### 6.2 Intelligent camera motion (Phase 6)
Drive a single **scalar intensity envelope** `E(t) ∈ [0,1]`, then map it once to zoom, caption animation, and grade. One envelope keeps the motion coherent — the reason amateur auto-zoom looks wrong is that each effect reacts independently.

```
E(t) = w₁·rms_norm(t) + w₂·pitch_delta(t) + w₃·rate_norm(t) + w₄·emphasis(t)
```

Then:
- **Zoom target** `z(t) = 1 + zoomStrength · E(t)`, clamped to [1.0, 1.30].
- **Critically-damped spring** (ζ = 1.0, ω ≈ 4 rad/s) between current and target — never a linear lerp. This is what makes movement read as a camera operator rather than a slider. It also guarantees no overshoot, which is the "never jitter, never abrupt" requirement.
- **Quantize decisions to shot boundaries and pauses.** A punch-in that starts mid-word looks like a glitch; one that starts on a pause reads as intentional. Snap zoom onsets to the nearest pause ≥150 ms within ±400 ms.
- **Rate limiting:** at most one punch-in per 4 s; forbid a zoom change during the first 800 ms of a clip (the hook must be stable) and the last 500 ms.
- **Quiet passages** (`E < 0.25` for >1.5 s): ease back toward 1.0 over ~1.2 s. This is the piece that makes the loud moments land.
- Keep the existing `MAX_PAN_FRAC` clamp for translation; it already works well.

Rendering: §3.1's `zoompan` fix. This is the same work item.

### 6.3 AI caption animation (Phase 7)
Today's "animated" mode re-emits the full line once per word with the active word at a flat 118% (`ffmpeg-render.ts:113`). It works, but it's one fixed animation with no easing and no reaction to anything. ASS supports far more, all through `libass` with no new dependency:

| Signal | ASS technique |
|---|---|
| Word onset (all words) | `{\t(0,90,\fscx112\fscy112)\t(90,180,\fscx100\fscy100)}` — a real ease, not a step |
| High energy (`E > 0.7`) | larger overshoot + `{\blur2}` glow + brighter `\1c` |
| Emphasis keyword (LLM-tagged) | colour swap + `{\bord}` pulse + hold 1.15× for the word's duration |
| Fast speech (>3.5 w/s) | shorten transition to 60 ms, drop to 3 words/line |
| Slow / quiet | 200 ms transitions, minimal scale, no glow |
| Line entry | `{\fad(80,60)}` + `\move` of ~12 px upward |

Two hard constraints, both currently unguarded: **readability wins** — cap total scale at 1.25× and never animate the outline width (it causes flicker on thin fonts); and **layout stability** — animating `\fscx` on a centred line makes neighbouring words shift. Fix by emitting each word as its own positioned event with precomputed `\pos` (widths are measurable from the font metrics `resolveFontFile` already loads), which also unlocks per-word colour without redrawing the line.

### 6.4 Smart zoom engine (Phase 8)

**Detection.** Rekognition gives boxes + `MouthOpen`, which is a weak speaking proxy — it fires on any open mouth. Two upgrades, in order of value per effort:
1. **Audio-visual correlation**: correlate each face's mouth-openness time series against the RMS envelope over a 500 ms sliding window. The face whose mouth movement correlates with the audio is the speaker. This is a ~50-line change on data we already have and is dramatically better than the current single-frame `MouthOpen === true` check.
2. Optional later: a proper AV-ASD model (TalkNet-class) on a GPU worker, only for Studio tier.

**Composition.** Current framing does vertical eye-line (35%) but centres horizontally. Add horizontal rule-of-thirds with **look-room**: if the face is oriented left (derivable from Rekognition `Pose.Yaw`, already returned by `FaceAttributes: ALL` but discarded at `reframe.ts:97`), bias the crop so the subject looks *into* the frame. Cheap, and it is the difference between "cropped" and "framed".

**Layouts by scene type** — decided once per clip from the face timeline:
| Scene | Detection | Layout |
|---|---|---|
| Single speaker | 1 cluster | pan + energy zoom ✅ (once §3.1 lands) |
| Two speakers, same frame | 2 clusters, both ≥40% coverage | **cut** between them on speaker change (currently only vstack) |
| Two speakers, dialogue | rapid alternation | split-screen vstack ✅ exists |
| Group (3+) | ≥3 clusters | **missing** — widen to group shot, punch to the speaker |
| No face | 0 clusters | slow drift + energy zoom (currently: nothing) |
| Screen-share / gaming | low face coverage + high edge density | **missing** — full-frame with speaker PiP |

**Anti-jitter checklist** (state the guarantees explicitly and test them): spring damping ζ≥1 (no overshoot by construction); dead zone — ignore target moves <2% of frame; minimum dwell 0.8 s before switching subject (currently 0.25 s at `reframe.ts:369`, too twitchy); hysteresis on cluster assignment; and a final smoothing pass over the emitted keyframes.

---

## 7. Competitor comparison

**Sourcing caveat, stated plainly:** the rows below come from vendor documentation and third-party 2026 review/benchmark write-ups, listed at the end of this section. Several of those are affiliate-driven comparison sites and should be treated as directional, not measured. I have not run our source material through these tools, so **no quality or speed claim here is first-party measured** — including the ones favourable to us. Where a competitor row says "✅", it means documented, not verified.

| | **Clipiro (today)** | Opus Clip | Klap | Vizard | Submagic | Captions | Descript | CapCut / VEED |
|---|---|---|---|---|---|---|---|---|
| Long-form → clips | ✅ | ✅ | ✅ | ✅ | ✗ (short-in) | partial | ✅ | ✅ |
| Virality score | ✅ + audio-calibrated + **admin-recalibrated from real engagement** | ✅ 0–100 | ✅ | ✅ | — | — | — | — |
| Score explainability | ✅ **sub-scores + prose + audience/platform** | partial | ✗ | partial | — | — | — | — |
| Active-speaker reframe | ⚠️ pan ✅ / zoom broken | ✅ ReframeAnything | ✅ (cited as tightest) | single-speaker biased | per-speaker subtitle colour only | ✅ | ✅ | ✅ |
| Dynamic layout switching | ⚠️ split-screen only, no cut-between | ✅ | ✅ | partial | ✗ | ✅ | ✅ | partial |
| Group (3+) layouts | ✗ | ✅ | partial | ✗ | ✗ | — | ✅ | — |
| Energy-reactive zoom | ✗ (broken) | ✅ | ✅ | partial | ✅ | ✅ | partial | ✅ |
| Animated captions | ✅ basic | ✅ | ✅ | ✅ | ✅ **category leader** | ✅ | ✅ | ✅ |
| Caption templates / emoji / b-roll keywords | ✗ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto B-roll | ✅ stock, 1 window | ✅ stock **+ AI-generated** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Scene/shot detection | ✗ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Filler/silence removal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **best-in-class** | ✅ |
| Timeline editor on the clip | ✗ (hand-off only) | ✅ | partial | ✅ | ✅ | ✅ | ✅ | ✅ |
| Review-before-charge | ✅ **rare** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Per-clip refunds / partial-failure refund | ✅ **unique** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| URL import (YouTube/Drive) | ✗ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-language captions | ✗ (dubbing ✅) | ✅ 20+ | ✅ strong | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dubbing | ✅ | partial | ✅ | ✗ | ✗ | ✅ | ✅ | partial |
| Publish / schedule | ⚠️ YouTube direct; others manual | ✅ + Buffer/Later | ✅ | ✅ | ✅ | ✅ | partial | ✅ |
| Performance tracking of posted clips | ✅ **Social Tracker, feeding score recalibration** | partial | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Public API | ✅ v1 | ✅ | ✅ | ✅ | ✗ | ✗ | ✅ | ✗ |

**Where we already win:** review-before-charge, proportional refunds, score explainability, and — the strategically interesting one — a **closed loop from published clip performance back into the scoring weights** (`virality-calibration.ts` ← `ClipPublish` ← Social Tracker). No competitor in this set documents that loop. That is the defensible product, and it gets stronger with usage while a competitor's hand-tuned score does not.

**Where we lose, in order of user-visible impact:** (1) no working zoom/motion, (2) no caption templates/emoji, (3) no scene detection, (4) no URL import, (5) no timeline on the clip, (6) no multi-language captions.

**Sources:** [Opus Clip Guide 2026 — AI Tool Radar](https://aitoolradar.io/guides/opus-clip) · [Opus Clip Review 2026 — Marc Andrews](https://marcandrews.com/opus-clip-review-2026-ai-video-shorts-tool-tested/) · [Opus Clip 2026 Complete Guide — AI Tools DevPro](https://aitoolsdevpro.com/ai-tools/opus-clip-guide/) · [Klap vs Vizard — Kompozy](https://kompozy.io/compare/klap-vs-vizard) · [Submagic vs Vizard vs OpusClip — Nextclip](https://www.nextclip.pro/blog/submagic-vs-vizard-vs-opusclip) · [State of Top AI Video Clipping Tools 2026 — Reap](https://reap.video/reports/state-of-top-ai-video-clipping-tools-2026) · [AI clipping tools compared — Whipscribe](https://whipscribe.com/tools/clipping) · [12 Best Opus Clip Alternatives — Choppity](https://www.choppity.com/blog/best-opus-clip-alternatives/)

---

## 8. Performance

**What is measurable from the code** (I did not have production telemetry, and there is none to have — see below):

| Property | Value | Assessment |
|---|---|---|
| Encoder | `libx264 -preset superfast -crf 23` | CPU-only; no NVENC/QSV path |
| Render concurrency | `RENDER_CONCURRENCY` default **2** | low; and clips within a batch are serial |
| Per-clip renders in a batch | **sequential loop** (`:998`) | 20 clips = 20× wall clock |
| FFmpeg watchdog | 15 min | reasonable |
| Rekognition poll | up to 5 min, **blocking a worker** | §3.5 |
| Extra full decodes per clip | 2 (thumbnail + `analyzeAudio`) | avoidable |
| Source downloads per project | 1 (pick) + 1 (render) + 1 **per re-render** | avoidable |
| Output flags | no `+faststart`, no `-pix_fmt` | playback + compatibility |

**There is no performance instrumentation at all** — no stage timings, no queue depth/latency metrics, no per-job cost accounting, no tracing. `logger` calls on failure are the entire observability surface. Everything above is inferred from code, and any benchmark claim against competitors would be invented. **The first performance work item is therefore measurement, not optimization:** emit per-stage duration + bytes + provider cost per job, then set targets.

Suggested targets once measured (a 60-minute 1080p source, 10 clips): analysis ≤4 min p50, render ≤45 s/clip p50, end-to-end ≤12 min p50. Klap is reported at 5–10 min and Vizard 15–20 min end-to-end for comparable inputs, per the Kompozy comparison — directional only.

Highest-leverage performance changes, in order: per-clip parallel jobs (near-linear win) → skip the two redundant decode passes → NVENC on a GPU worker pool for Pro/Studio → cache the source between pick and render → §3.8 expression simplification.

---

## 9. Scalability & security

**Scalability.** Queue architecture is sound (durable, retrying, priority-mapped to tier). The constraints are: worker slots blocked by Rekognition polling (§3.5); unbounded JSON columns for `faceTimeline` and `transcriptJson` (§3.7); `os.tmpdir()` disk pressure with no per-job isolation or quota — two concurrent 6-hour sources plus intermediates can fill a disk and take down every job on the box; and a single Gemini call whose token count grows linearly with source length (§3.6). None require re-architecture; all four are contained fixes.

**Security.** *(Corrected 2026-09-02: the "no gaps found" claim below was wrong.
Two clip routes verified only the **project**, then queried by `clipId` alone —
`GET .../clips/[clipId]/publish` and `GET .../clips/[clipId]/dub` — so any user
owning a single project could read another tenant's publish permalinks, post ids,
metrics and dub video URLs. Fixed and pinned by regression tests in
`publish/route.test.ts` and `dub/route.test.ts`. Ownership audits must check the
**leaf** id, not just its parent.)*

The good: ownership is verified on most clip routes (`findFirst({ id, userId })`); upload has a MIME allowlist with an explicit stored-XSS rationale; credits use atomic bucket-aware spends with idempotent refIds; the reframe enums are properly sanitized at the trust boundary and — notably — invalid values are *dropped* rather than defaulted, so a bad client can't silently overwrite a user's setting.

The gaps: unvalidated `subtitleStyleOverride` and unbounded `transcript` payloads reaching the ASS writer (§3.12); no rate limit on `style`/`transcript`/`rerender` (§3.3), which is both an abuse and a cost vector; auth token in `localStorage` (`useVideoGenerate.ts:8`), so any XSS is a full account takeover — a repo-wide issue, not AutoClip's, but AutoClip is a high-traffic surface for it; and rendered clips go to S3 at predictable keys (`renders/{projectId}/clip-{index}.mp4`, `:937`) — `projectId` is a UUID so it's not enumerable, but these are permanent unsigned URLs for what may be unreleased content, while the Asset path elsewhere in the codebase has already moved to signed URLs. Align them.

---

## 10. Prioritized roadmap

### P0 — Correctness & trust (2 weeks)
1. **Fix the zoom pipeline** — `zoompan`, spring smoothing, plus an execution-level filter test (§3.1). *This is the release.*
2. Null/recompute `cropKeyframes` on aspect change in confirm + rerender (§3.2).
3. Unify re-render charging across the three routes; add rate limits (§3.3).
4. Refund failed single-clip re-renders (§3.4).
5. Validate `subtitleStyleOverride` / `transcript`; escape ASS text (§3.12).
6. Await enqueue; refund on failure (§3.11).
7. Surface real failure reasons to the client (§4.7).

### P1 — Long-form actually works (3 weeks)
8. Rekognition via SNS callback; remove the 5-minute cap and the blocked worker (§3.5).
9. Sentence-level timestamps + map-reduce selection + structured output (§3.6).
10. `faceTimeline` to S3 sidecar + downsample (§3.7).
11. Per-clip parallel render jobs; drop redundant decode passes (§8).
12. Non-retryable error class (§3.10).
13. **Live cost estimate in Review** (§4.2).

### P2 — Close the visible gaps (4 weeks)
14. Signal track: RMS + pitch + emphasis tags + **scene detection** (§6.1).
15. Energy-reactive caption animation (§6.3).
16. AV-correlation active-speaker detection; cut-between for two speakers; look-room framing (§6.4).
17. Caption templates + emoji + keyword highlighting (biggest single competitive gap after zoom).
18. URL import (YouTube/Drive).
19. Chunked/resumable upload with real progress (§4.1).

### P3 — Differentiate (6 weeks+)
20. WYSIWYG review: render 3-second proxy previews of the *actual* framing before charging.
21. Clip timeline editor in-place (split/merge/speed/music/transitions), reusing the existing editor primitives.
22. Group and screen-share layouts (§6.4).
23. Multi-language captions (translation, not just dubbing).
24. Full brand kits: logo, colours, fonts, watermark, intro/outro.
25. **Lean into the closed loop** — surface "clips scored ≥80 by our model averaged N× the views of clips under 50, based on your own posted clips." Nobody else in §7 can say that. It is the strongest marketing asset in the codebase and it is currently invisible.

### P4 — Infrastructure
26. Per-stage metrics, cost accounting, queue dashboards (§8).
27. GPU worker pool with NVENC for paid tiers.
28. Signed URLs for rendered clips; per-job tmp isolation with quotas.

---

## 11. Implementation notes for P0 #1 (the zoom fix)

The one item worth spelling out, since everything else is contained.

```
lib/reframe.ts
  buildDynamicCropFilter(keyframes, aspect)
    → constant-size crop at max(w) over the path, x/y expressions unchanged (they work)
    → append zoompan with z/x/y as functions of `on` (output frame index), d=1,
      s=TARGET_RES[aspect], fps=30
    → pre-scale intermediate to 2× target before zoompan; final scale absorbs
      zoompan's integer x/y rounding (this is the jitter fix)
  buildSplitScreenFilterComplex → same treatment per half
  computeAdvancedCrop → replace the EMA + clamp on scale with a critically-damped
    spring; snap zoom onsets to pauses; enforce min-dwell 0.8s and max one
    punch-in per 4s
```

Test to add (`lib/reframe.render.test.ts`, tagged slow): build the graph for a synthetic keyframe path, run 10 frames of `testsrc` through the real `ffmpeg-static` binary, assert exit 0, assert output dimensions equal `TARGET_RES`, and assert the mean frame-difference between frame 1 and frame 10 exceeds a threshold — i.e. **assert that motion actually happened**. String-shape assertions are what let this ship.
