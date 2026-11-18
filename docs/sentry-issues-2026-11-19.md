# Sentry issues — 2026-11-17 → 2026-11-19

Every issue in `clipiro/clipiro-web` with activity after the last Sentry fix,
PR #445 (merged 2026-11-17 10:45 UTC). Releases in that window: `67c31f14`
(#445), `7f302900` (#448), `a4f73e96` (#449), `c95c0e1f` (#450–#452).

Branch: `fix/sentry-issues-2026-11-19`.

## Summary, by priority

| # | Priority | Issue | Where | Events | User impact | Status |
|---|----------|-------|-------|--------|-------------|--------|
| 1 | **P1** | CLIPIRO-WEB-9, -16 | Database connections (any page/API) | 34 + 1 since #445 (41 lifetime) | Requests fail with 500 while the pool is full; seen on /dashboard/social-tracker and the web-vitals beacon | Fixed in code; **owner should switch DATABASE_URL to transaction mode** |
| 2 | **P1** | CLIPIRO-WEB-15 | AutoClip — import from a link | 2 (2 projects, 1 user) | Every long link import fails for the user; the downloaded file is left orphaned in S3 | Fixed |
| 3 | **P1** | CLIPIRO-WEB-14 | AutoClip — clip re-render | 2 | Re-render always fails for videos wider than 16:9 or taller than 9:16 (modern phone recordings) | Fixed |
| 4 | P2 | CLIPIRO-WEB-13 | Image Generator — "Enhance prompt" | 1 | Unhandled 500 when Gemini blocks a prompt; user sees a generic error | Fixed (+ same bug in 3 sibling routes) |
| 5 | P3 – owner action | CLIPIRO-WEB-12 | Photo Edit (Gemini model) | 5 | Gemini photo edits fail (refunded) — the key is still free tier | Noise fixed; **needs Gemini billing** |
| 6 | P3 | CLIPIRO-WEB-11 | AutoClip — plan length cap | 2 | None — correct "upgrade for longer videos" message | Fixed (noise) |
| – | – | CLIPIRO-WEB-T | URL import yt-dlp probe | 0 since 2026-11-16 | — | Fixed by #442; resolve |

---

## 1. Database pool exhausted (WEB-9, WEB-16)

**What happened.** `DriverAdapterError: (EMAXCONNSESSION) max clients reached
in session mode - max clients are limited to pool_size: 15`. WEB-9 was a burst
of 34 errors in three minutes (2026-11-17 18:39–18:42 UTC), ten minutes after
the #448 deploy restarted the app, all on `POST /api/marketing/vitals`. WEB-16
hit `GET /dashboard/social-tracker` (eight parallel queries in one page render)
on 2026-11-18 19:27.

**Root cause.** Production's `DATABASE_URL` uses Supabase's pooler in
**session mode**, where every open client connection pins one of only **15**
server connections. Our side could open more than that:
- `lib/prisma.ts` created a `pg.Pool` with the default `max: 10`, and cached it
  on `globalThis` only outside production. Turbopack evaluates the module once
  per entry that bundles it (the proxy bundle already has its own Redis client
  for the same reason — see WEB-5), so one process could hold several pools.
- During a deploy the old and new processes overlap, each with its own pools.
- The web-vitals beacon did one DB upsert per metric per page view — up to five
  concurrent writes per visitor — so a burst of visitors or a crawler filled the
  pool on its own.

**Fix.**
- `lib/prisma.ts`: the pool and client are cached on `globalThis` in every
  environment (one pool per process), sized by new `lib/db-pool-config.ts`:
  `max` 6 by default (two overlapping processes stay under 15), override with
  `DATABASE_POOL_MAX`; idle connections released after 10s; a 20s acquire
  timeout so a starved pool fails instead of hanging.
- `lib/web-vitals-buffer.ts`: vitals are counted in memory and written every
  15s (or at 200 keys) as one sequential upsert per (date, metric, path,
  bucket). A failed write is a warning, not a Sentry error — it is analytics.

**Owner action (recommended).** Switch `DATABASE_URL` on Hostinger to the
pooler's **transaction mode** (same host and credentials, port **6543**
instead of 5432). Transaction mode shares the 15 server connections between
any number of clients, which removes this ceiling entirely. `prisma.config.ts`
already sends migrations to session mode (5432) when it sees `:6543`.

## 2. Link import finishes after the draft was discarded (WEB-15)

**What happened.** `prisma.project.update()` → P2025 "No record was found for
an update" in `POST /api/projects/[id]/import-url`, twice, for two different
projects of the same user (18:20 and 18:35 UTC on 2026-11-18, right after the
Twitch import in #450 shipped). The breadcrumbs show the S3 upload succeeding
half a second before the failed update.

**Root cause.** The import route downloaded the whole video (yt-dlp, then the
S3 upload) **inside the HTTP request**. A long Twitch/YouTube VOD takes
minutes — longer than the connection survives behind the hosting proxy. The
browser got a failed request, did the right thing for a failed import and
deleted the draft project (`discardDraftProject`), while the server kept
downloading. When the server finished, it uploaded to S3 and tried to update a
project that no longer existed. So for the user every long import failed, and
each one left an orphaned video in the bucket.

**Fix.**
- New `lib/url-import-jobs.ts`. The web client now sends `{ url, async: true }`;
  the route answers **202** at once and the import runs in the background.
  The browser polls `GET /api/projects/[id]/import-url?status=1`
  (`importUrlAndWait` in `auto-clip/_components/shared.tsx`) every 3s. State
  lives in Redis for 6h; a "running" state older than an hour (a process
  restarted mid-download) reads as "interrupted".
- Finishing is race-safe on both paths: `updateMany` scoped to the user's
  **draft**; if the row is gone the upload is deleted from S3 and the import
  ends as "This project was deleted before the import finished" (409 on the
  synchronous path) — a warning, not an error.
- The synchronous form stays for the mobile API (`/api/mobile/v1/jobs`), which
  is also a long-held request: it should move to the async form before the
  Android release.

## 3. Clip re-render fails on wide/tall sources (WEB-14)

**What happened.** `FFmpeg exited 1` on `POST …/clips/[clipId]/rerender`:
`[Parsed_crop_0] Invalid too big or non positive size for width '2400' or
height '1350'`. The source was a 1080x2400 (20:9) phone recording.

**Root cause.** The static aspect crop in `lib/autoclip-pipeline.ts` (and the
preview copy in `lib/autoclip-preview.ts`) fixed one side and derived the
other: `crop=in_w:in_w*9/16` for 16:9, `crop=in_h*9/16:in_h` for 9:16,
`crop=in_h:in_h` for 1:1. That only fits a frame no wider than 16:9 (16:9
crop) or no taller than 9:16 (9:16 and 1:1 crops). A 2400-wide frame asked for
a 1350-high crop out of 1080 rows. Modern phones record 19.5:9–20:9, so any
such clip that falls back to the static crop (no face track) failed every
render.

**Fix.** `centeredAspectCrop()` in `lib/crop.ts`: the largest centred window
of the aspect that fits the frame, both sides clamped to the input and rounded
to even numbers. Both callers use it. `lib/crop.test.ts` runs real ffmpeg on
2400x1080, 1080x2400 and the ordinary shapes, and reproduces the original
error with the old filter.

## 4. "Enhance prompt" 500 on a blocked prompt (WEB-13)

**What happened.** `[GoogleGenerativeAI Error]: Text not available. Response
was blocked due to PROHIBITED_CONTENT`, unhandled, in
`POST /api/tools/enhance-prompt`.

**Root cause.** `result.response.text()` throws when Gemini refuses on
policy, and that route had no try/catch at all (a Gemini timeout was an
unhandled 500 too). The editor AI routes (`ai-text`, `ai-ideas`) and the
Brainstormer caught it but logged a policy refusal as an error and told the
user to "try again", which cannot help.

**Fix.** New `lib/gemini-text.ts` (`geminiText()`): reads
`promptFeedback.blockReason` / `finishReason` and throws `GeminiBlockedError`.
All four routes answer **422** "Our AI provider declined this request under
its content policy. Try rewording it." and log a warning; real failures still
page. Enhance Prompt now answers 502 instead of throwing on other failures.

## 5. Gemini image quota (WEB-12) — owner action

**What happened.** `gemini-2.5-flash-image quota exhausted
(…-FreeTier)` from Photo Edit, 5 events from one user's two attempts.

**Root cause.** Unchanged from the 2026-11-17 sweep: the Gemini API key's
Google project is on the **free tier**, which has no image quota. #445 made
the failure clear and refunded; the remaining noise is that Photo Edit renders
several images in parallel, each got the same 429 and each reported it, and
every retry called Google again.

**Fix (code).** `lib/gemini-image.ts`: after a hard-cap 429, a 15-minute
cooldown — calls fail fast with the same refunded "pick another model"
message, without calling Google and without reporting again. One report per
cooldown.

**Owner action.** Enable billing on the Gemini key's Google Cloud project (or
switch to a key from a billed project). Until then Gemini image options in
Image Generator and Photo Edit cannot work.

## 6. Plan length cap reported as an error (WEB-11)

**What happened.** `NonRetryableError: Video is 37 min — your plan supports
Auto Clips up to 30 min per video` (2026-11-17 11:30).

**Root cause.** The pipeline's correct verdicts about the user's input (too
short, over the plan's length cap, not enough Clip Minutes) and real permanent
failures share `NonRetryableError`, and the job queue logged every final
failure as an error. Since #450 the browser checks plan limits before upload,
but a link import or an older tab still reaches the server check.

**Fix.** `NonRetryableError` takes `{ expected: true }`; the three user
verdicts in `pickJob` set it and the in-process queue logs those as warnings.
Unexpected permanent failures still page.

---

## After deploy

- Resolve WEB-9, WEB-11, WEB-12, WEB-13, WEB-14, WEB-15, WEB-16 and WEB-T in
  Sentry ("in next release").
- Switch `DATABASE_URL` to transaction mode (port 6543) — recommended.
- Enable billing on the Gemini key's project.
- Delete the two orphaned imports (`uploads/<user>/10aa08f8-…` and
  `uploads/<user>/2348155f-…`) from S3, or leave them to the bucket lifecycle.
