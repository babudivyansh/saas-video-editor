# AutoClip — End-to-End Test Report

**Date:** 2026-08-08 · **Branch:** `fix/autoclip-e2e-hardening` (off `main` @ `00d4d2f`) · **Commits:** `83c8a86`, `a5d88d8`

**Method:** two passes. First, a purpose-built HTTP harness (`scripts/autoclip-e2e.ts`, committed) driving the real routes, queue, ffmpeg and S3 against a synthetic fixture. Second, the user's own 16-minute talking-head video driven through the actual UI in Chrome — upload, settings, analyze, review, confirm, render, Studio drawer. Every claim below is either an observed run or a cited `file:line`. Nothing here is inferred from the previous audit document.

---

## 1. Executive summary

The AutoClip **pipeline is sound**. A real 16-minute source produced three correct clips — 1080×1920, exact durations, audio intact, B-roll spliced, waveform peaks computed — and the credit ledger moved by precisely the amount quoted in the Review step. The two-phase pick → review → confirm flow, the double-submit guards, the refund paths and the render graph all behave as designed.

The problems found were concentrated in three places: **UI state** (a stuck spinner, inputs that rewrote typed values), **user-facing honesty** (the product blaming the user's video for our own failures), and **configuration** (two credentials that are wrong or missing in the live environment).

Nine code bugs were found and fixed. But the two highest-impact findings are **not code** and need a human:

1. 🔴 **The AWS IAM user has no Rekognition permissions.** Speaker tracking / auto-reframe has therefore never worked for any user, on any video, in production — every clip gets a static centre crop. The same denial also silently disables upload moderation scanning.
2. 🔴 **`ELEVENLABS_API_KEY` is a key *ID*, not a key.** Transcription always fails, which means no captions, no silence removal, no emphasis — and, downstream, the AI writes confident titles and audience analysis for a video it never read a word of.

Fixing those two credentials switches on a large amount of already-written, already-tested functionality. That is the single highest value-per-effort action available.

---

## 2. What was tested, and how

### 2.1 The harness — `scripts/autoclip-e2e.ts`

New, committed, and re-runnable with `npx tsx scripts/autoclip-e2e.ts`. It exercises the full spine:

upload → project create → analyze → poll picks → cost estimate → confirm → poll render → **probe the output files** → Studio edit paths → bulk download → ownership isolation.

The important design decision: it does not trust a database row marked `ready`. It downloads each rendered MP4 and asserts **dimensions per aspect ratio and per plan tier**, duration against the charged duration, presence of an audio track, and a non-trivial file size. A clip that "succeeded" while producing a 3 KB black file fails the run.

**Result: 49 / 49 pass.**

It also self-reports its own blind spot. With no working STT key it prints:

> NOTE: this run had no transcript (no working STT key), so caption, silence-removal and emphasis paths were NOT exercised.

### 2.2 The real-video run

| | |
|---|---|
| Source | 78 MB, 16:05, 1280×720 h264, single speaker + screen-share segments |
| Settings | 3 clips, 20–45 s, 9:16, captions on, Dynamic camera motion |
| Analysis | ~30 s |
| Output | 3 clips, **1080×1920**, durations 30 / 35 / 25 s (exact), audio present, B-roll spliced into all three, 300 waveform peaks each |
| Credits | 510 → 506 — 1 for analysis, 3 on confirm, exactly as the Review step quoted |

### 2.3 Gates

`npx tsc --noEmit` clean · `npm run lint` **0 errors** · 237 AutoClip-related tests passing across 15 files.

---

## 3. Code bugs found and fixed

### 3.1 Commit `83c8a86` — harness + six fixes

| # | Severity | Finding |
|---|---|---|
| 1 | **High** | **Results polling never resumed once a project finished.** The poll interval cleared itself when the project reached `completed`/`failed` and nothing ever restarted it. Every subsequent re-render, Studio "Apply" and Retry-on-failed-clip left the card spinning on "Queued" and the drawer stuck on "Applying changes…" until the user reloaded — while the render had actually finished minutes earlier. Polling is now derived from whether anything is genuinely in flight, so it resumes on its own and still stops when idle. |
| 2 | Medium | **The Review step accepted invalid trim windows** (end ≤ start, or > 300 s) and only surfaced the problem as a raw server error string after pressing Confirm. Now flagged on the field while editing, with Confirm disabled. |
| 3 | Medium | **The estimate route priced windows that Confirm rejects.** An inverted window contributed a *negative* duration to the total and could quote **0 credits** for a selection the server would then refuse. That endpoint exists precisely so the quote and the charge cannot disagree, so it now applies Confirm's validation. |
| 4 | Medium | **Confirming could silently delete a clip.** A clip with no edit entry yet spread `undefined`, leaving `keep` unset — which the confirm route reads as "dropped". Missing entries now default to keep. |
| 5 | Medium | **`refundCredits` could mint credits that were never paid.** It treated *any* restore shortfall as a legacy project and granted the difference outright. But a single run can refund twice (partial-failure, then the trimmed-duration delta), and both amounts are computed from gross pricing while the confirm charge is net of the analysis credit — so a shortfall is an entirely ordinary outcome. The legacy top-up is now limited to refIds with no ledger history at all, which is what it was for. |
| 6 | Low | **`refundFailedRerender` drove `rerenderCount` negative.** The queue retries a throwing job three times and every attempt refunded, so the counter went below zero — after which `attempt` (`rerenderCount - 1`) no longer named the refId the charge was recorded under. |

### 3.2 Commit `a5d88d8` — three fixes, all surfaced by the real-video run

| # | Severity | Finding |
|---|---|---|
| 7 | **High** | **The number inputs rewrote what you type.** They clamped on every keystroke and fed the clamped value straight back into the controlled input. Typing `20` into Min sent `2`, which clamped to the floor of 5, so the next keystroke appended to *that* and the field landed on **50**. `45` into Max became **165**. Observed live: a job configured as "20–45 s clips" silently became "50–165 s clips". Fields are now edited as text and clamped on blur. |
| 8 | Medium | **Face detection reported "no faces found" and "could not run" as the same empty array**, so the banner told the user their video was the problem. In this run the real cause was an IAM denial affecting *every* video on the deployment. `detectFaceTimeline` now returns `{ boxes, failure }` where failure is `unconfigured` / `error` / `timeout`, and the UI has separate copy for "this footage has no faces" versus "this is broken on our side". Seven new unit tests cover the classification, including the exact `AccessDeniedException` case. |
| 9 | Medium | **The transcription-failure warning undersold what actually breaks.** It said quality "may be lower than usual". What really happens is that the model never sees a word of the video: moments are spaced rather than chosen, and the titles, captions, hashtags and insights are invented. Evidence from this run — a video about Japanese AI research produced the title *"The one mistake everyone makes with their money"* and an Insights panel confidently describing a target audience of *"young adults, financially conscious individuals"*. The copy now says exactly this. |

### 3.3 Files touched

`app/dashboard/create/auto-clip/page.tsx` · `app/api/projects/[id]/clips/estimate/route.ts` · `lib/autoclip-pipeline.ts` · `lib/autoclip-rerender.ts` · `lib/reframe.ts` · `lib/asd.ts`

New tests: `lib/reframe.detect.test.ts` · `lib/autoclip-refund.test.ts` · `app/api/projects/[id]/clips/estimate/route.test.ts`

### 3.4 Fixes verified in the browser, not just in tests

- **Bug 1:** on an already-completed project, clicking Re-render showed `1/2 ready → Queued → 23% → 2/2 ready` across four automatic polls with no reload, then polling stopped again.
- **Bug 2:** setting End below Start produced a red field, the inline message "End must come after start.", a disabled Confirm button, and the cost panel correctly holding its last valid figure instead of blanking or quoting nonsense.
- **Bug 7:** after the fix, typing 20 / 45 / 3 produced exactly 20 / 45 / 3, and the Settings Summary agreed.

---

## 4. Environment and infrastructure findings

These are **not code bugs**. They cannot be fixed from the repository and need an owner.

### 4.1 🔴 The AWS IAM user has no Rekognition permissions

```
User: arn:aws:iam::702921688172:user/saas-video-editor-user is not authorized
to perform: rekognition:StartFaceDetection
because no identity-based policy allows the rekognition:StartFaceDetection action

... is not authorized to perform: rekognition:DetectModerationLabels
```

Two consequences, both live in production right now:

1. **Speaker tracking and auto-reframe have never worked for anyone.** Every AutoClip on every video falls back to a static centre crop. All of the reframe machinery — single-speaker pan, two-speaker split-screen, active-speaker cutting, group layouts, eye-line composition, the energy-reactive zoom — is written, unit-tested, execution-tested against real ffmpeg, and completely dead. On the test video this was visibly destructive: two of the three clips were screen-share/slide segments, and a 16:9 → 9:16 centre crop cut away most of the text.
2. **Upload moderation scanning silently fails.** `lib/asset-moderation.ts` calls `DetectModerationLabels`, which is denied, so uploads are not being checked.

**Fix:** attach `rekognition:StartFaceDetection`, `rekognition:GetFaceDetection` and `rekognition:DetectModerationLabels` to that IAM user.

### 4.2 🔴 `ELEVENLABS_API_KEY` is a key ID, not a key

```
401 { "status": "api_key_id_used_as_api_key",
      "message": "API key ID used as API key — only valid API keys can be used.
                  API keys start with 'sk_'" }
```

Transcription therefore always fails. Downstream: no burned-in captions, no silence or filler removal, no emphasis-driven caption animation, no dubbing — and the fabricated titles and insights described in finding #9 are entirely a consequence of this.

### 4.3 🟠 No `OPENAI_API_KEY`, so STT has no fallback

`lib/transcription.ts:15` falls back to Whisper only when `OPENAI_API_KEY` is set. It isn't, so `transcribe()` is a single point of failure on ElevenLabs — which is exactly what happened.

### 4.4 🟡 Local development notes

- **Next 16 dev spawns multiple worker processes**, and `lib/redis.ts`'s in-memory fallback is per-process. A session written by one worker is invisible to the next, so with Redis down *every* authenticated request 401s. Redis has to actually be running locally. Postgres runs natively on :5432.
- **`proxy.ts` gates all non-public `/api/*` on the session cookie**, not the `Authorization` header — a Bearer-header-only client always 401s before any handler runs. `/api/v1/*` is exempt (it authenticates by API key). This matters for any non-browser integration and for test scripts; the harness captures and replays the cookie for this reason.

---

## 5. API keys and external services used by AutoClip

Every entry below was traced to a call site in the AutoClip path.

### 5.1 Hard requirements — the feature will not run without these

| Key | Service | Used at | Without it |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL | `lib/prisma.ts` | Nothing works — projects, clips, credits |
| `JWT_SECRET` | — (session signing) | `lib/auth.ts` | No authentication |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION` | AWS S3 + Rekognition | `utils/s3-upload.ts:19-26`, `lib/reframe.ts:22` | No source uploads, no rendered clip or thumbnail storage, no face detection |
| `GEMINI_API_KEY` | Google Gemini 2.5 Flash | `lib/autoclip-pipeline.ts:330` (clip selection), `lib/caption-translate.ts:36` (caption translation) | `/api/generate/auto-clip` returns **503 "Auto-clip is not configured on this server"** |

> `GOOGLE_GEMINI_API_KEY` also exists in the env schema, but only one unrelated route (`/api/generate/reddit-video-script`) reads it. AutoClip uses `GEMINI_API_KEY` exclusively.

### 5.2 Feature-gating — AutoClip runs without these, but degraded

| Key | Service | Used at | Without it | Status |
|---|---|---|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs (Scribe STT, dubbing, TTS) | `utils/elevenlabs.ts:33,125`, `.../clips/[clipId]/dub/route.ts:32` | No transcript → no captions, no silence/filler removal, no emphasis, no dubbing; titles and insights become invented | ❌ **invalid (key ID)** |
| `OPENAI_API_KEY` | OpenAI Whisper | `lib/transcription.ts:15` | No STT fallback when ElevenLabs fails | ❌ not set |
| `PEXELS_API_KEY` | Pexels stock video | `lib/broll.ts` → `lib/editor/stock-providers.ts:61` | No auto B-roll | ✅ working |
| `JAMENDO_CLIENT_ID` | Jamendo | `lib/editor/stock-providers.ts:93` | No music beds in the Lite editor | ✅ set |
| `GIPHY_API_KEY` | Giphy | `lib/editor/stock-providers.ts:117` | No stickers / GIF presets | ✅ set |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | YouTube Data API | `lib/social/google.ts:43` | No direct YouTube publishing | ✅ set |
| `META_APP_ID`, `META_APP_SECRET` | Meta Graph API | `lib/social/meta.ts:26` | No Instagram/Facebook linking (auto-publish is separately blocked on Meta app review) | ✅ set |
| `SOCIAL_TOKEN_KEY` | — (encryption at rest) | social token storage | Stored social tokens unencrypted | ✅ set |

### 5.3 Infrastructure and tuning — no external billing

| Key | Purpose | Used at |
|---|---|---|
| `REDIS_URL` | Sessions, rate limits, credit cache, BullMQ | `lib/redis.ts`, `lib/render-queue.ts:129` |
| `RENDER_QUEUE_DRIVER` | `in-process` vs BullMQ (production currently in-process) | `lib/render-queue.ts:108` |
| `RENDER_CONCURRENCY` | Parallel *jobs* (default 2) | `lib/render-queue.ts:130` |
| `RENDER_CLIP_CONCURRENCY` | Parallel *clips within one job* (default 3) | `lib/autoclip-pipeline.ts:1662` |
| `GPU_SERVICE_URL`, `GPU_SERVICE_TOKEN`, `GPU_SERVICE_API_KEY` | Optional active-speaker-detection service, preferred over Rekognition | `lib/gpu-service.ts:41,86` |
| `CDN_BASE_URL` | Public asset URL rewriting | `utils/s3-upload.ts:144` |
| `SENTRY_DSN` | Error reporting | `instrumentation.ts` |

### 5.4 What actually costs money per AutoClip run

Only four: **Gemini** (1 call, or one per 20-minute window on sources over 45 minutes), **ElevenLabs** (STT, per minute of audio), **AWS** (S3 storage/transfer + Rekognition Video, billed per minute of source), and **Pexels** (free tier, rate-limited). Everything else is either infrastructure you already pay for or free.

---

## 6. Suggestions

### P0 — turn on what is already built

1. **Attach the Rekognition IAM permissions** (§4.1). This is the highest value-per-effort item in the entire report: it activates speaker tracking, split-screen, active-speaker cutting and the energy-reactive zoom, all of which are already written, tested and currently dead. It also restores upload moderation.
2. **Replace `ELEVENLABS_API_KEY` with a real `sk_` key**, then re-run `npx tsx scripts/autoclip-e2e.ts`. The harness will then cover the caption, silence-removal and emphasis paths it currently reports as untested — roughly half the feature surface.
3. **Set `OPENAI_API_KEY`** so transcription stops being a single point of failure.

### P1 — product honesty and output quality

4. **Stop inventing metadata when there is no transcript.** The warning banner now tells the truth, but the product still presents fabricated titles and a confident audience analysis with a 91/99 score attached. Consider falling back to neutral titles (`Clip 1 · 6:50–7:25`) and suppressing the Insights panel entirely when `transcription_failed` is set. Confidently wrong metadata is worse than none.
5. **Add a screen-share / slide layout.** Two of three clips from the real video were slides, and a 9:16 centre crop destroyed them. This is the standard shape for tutorial and podcast content, which is the segment the tier length caps are sold to.
6. **Alert on `reframe_failed`.** With the new warning code, a spike in it means a broken deployment rather than unlucky uploads — exactly the signal that would have caught §4.1 months ago.

### P2 — worth doing

7. **Let the Studio drawer re-enable captions** on a clip picked with them off. `captionStyleIndex` is already accepted by `rerenderPatchSchema`; the UI simply never sends it, so today the only remedy is re-running the whole analysis.
8. **Fix clip downloads.** `<a href={s3Url} download>` is ignored cross-origin, so "Download" navigates or plays instead of saving. Serve through a same-origin redirect route or set `Content-Disposition` on the object.
9. **Fix the resumed-session skeleton count.** `expectedCount` comes from local state, so opening `?project=…` shows one skeleton regardless of how many clips are actually rendering.
10. **Reconcile `docs/autoclip-audit-2026-08.md`.** It is now substantially stale — the `zoompan` fix, execution-level render tests, unified re-render charging, ASS sanitisation, map-reduce clip selection, the S3 face-timeline sidecar and parallel clip rendering have all shipped since it was written, so it overstates the remaining gaps.

### P3 — noted, not urgent

11. **Rekognition's 5-minute poll cap still blocks a worker slot** and silently disables tracking on long sources. The SNS-callback design from the earlier audit remains the right fix — but it only becomes relevant once P0 #1 lands.
12. **Session-cookie loss logs a user out of the API** while the UI still looks signed in, because the localStorage token survives independently. Repo-wide, not AutoClip-specific.

---

## 7. Reproducing this

```bash
# Prerequisites: Postgres on :5432, Redis on :6379, .env populated
npm run dev

# Full API-level run, including output file probing
npx tsx scripts/autoclip-e2e.ts

# Targeted regression suite
npx vitest run lib/autoclip-*.test.ts lib/reframe*.test.ts \
  "app/api/projects/[id]/clips/estimate/route.test.ts" \
  "app/api/projects/[id]/clips/confirm/route.test.ts"
```

The harness provisions its own user, grants credits, upgrades to a paid plan (so it asserts the full-resolution path rather than the free tier's 720p watermarked output), and prints a PASS/FAIL summary with an explicit note about any path it could not exercise.
