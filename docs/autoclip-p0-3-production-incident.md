# Clipiro AutoClip P0-3 Production Incident

Independent of the P0-2 `drawtext` incident and of P0-1 captions. Neither was
the cause here — this pipeline never reached the stages those covered.

## Original Symptoms

### Progress-0 failure

Every AutoClip re-render failed immediately:

```
status = failed
progress = 0
failureReason = null
```

The source was believed reachable, which made the failure look like a queue or
worker problem.

### +2 credit anomaly

Two failed re-renders left the balance **higher** than before:

```
781 → 783
```

The user gained credits by failing. Ordinary spend/refund arithmetic could not
explain it.

## Root Cause A — Stale Presigned Source URL

`Project.uploadedVideoUrl` persists the **presigned upload URL**, not a durable
object identity. AutoClip downloaded that stored value directly.

| | |
|---|---|
| Field persisted | `Project.uploadedVideoUrl` (presigned S3 URL) |
| Signature lifetime | `X-Amz-Expires=21600` — 6 hours |
| Example URL signed | `20260813T182724Z` |
| Still in use on | 2026-08-24 (**~10.6 days stale**) |
| S3 response | `403` — `AccessDenied` / **"Request has expired"** |
| Pipeline position | `rerenderJob`'s **first statement** (`downloadFile`) |

Because the download is the first thing the job does, it threw before any
progress write — hence `progress = 0` permanently. The job never reached
Rekognition, transcription, smart reframe, captions or FFmpeg, so every earlier
theory naming those stages was describing something the code never executed.

The manual editor had already solved this class: `app/api/editor/render/route.ts`
re-mints a signed URL per render from the stored S3 key. AutoClip did not.

## Root Cause B — Retry Refund Identity

The failure path refunded **and then rethrew a plain `Error`**, so the
in-process driver retried it (`MAX_RETRIES = 2` → 3 attempts).

`refundFailedRerender` derives the attempt from `clip.rerenderCount` and then
**decrements it**. So each retry recomputed a *lower* attempt and therefore a
*different* `refId`, restoring a **different, earlier, already-delivered**
re-render's spend:

```
attempt 1 → refund refId :N-1 → rerenderCount N-1
attempt 2 → refund refId :N-2 → rerenderCount N-2
attempt 3 → refund refId :N-3 → rerenderCount N-3
```

One new spend, three valid-but-wrong refunds → **net +2**.

`restoreSpend` is idempotent *per refId* — it nets all deltas for a key under a
row lock — and that protection was useless here, because every retry targeted a
**different key**. This is the precise distinction:

> Function-level idempotency is not operation-level idempotency.

## Fix A — Fresh URL re-minting

`lib/source-url.ts` recovers the S3 object key from the stored URL (the key is
the durable part; only the signature rots) and re-mints via `getAssetReadUrl`.
Handles virtual-hosted, path-style and CDN URL shapes; returns null for foreign
hosts or a different bucket rather than inventing a key, in which case the
caller falls back to the stored URL rather than making things worse.

Applied at all three AutoClip download sites in `lib/autoclip-pipeline.ts`
(batch run, render job, re-render).

## Fix B — NonRetryableError + failure observability

- The proven-unrecoverable failure path now throws `NonRetryableError`, honoured
  by **both** drivers (in-process skips the retry; the BullMQ driver maps it to
  `UnrecoverableError`) while still throwing, so the queue wrapper still records
  the run as failed. One logical operation now produces at most one refund.
- A sanitized classification (`lib/autoclip-failure.ts`) is persisted to
  `Project.failureReason`. `Clip` has no such column. Raw errors can carry a
  presigned signature, provider body or temp path and are never surfaced.
- Each bookkeeping step in the failure path is individually wrapped, because
  `.catch()` guards only a rejected promise — a synchronous throw from one step
  previously masked the original error and skipped the refund. Caught by CI.

## Production AutoClip Verification

Two projects, both of which previously failed at progress 0.

| | Project `4c16cef2` | Project `0db41079` |
|---|---|---|
| Project age | created 2026-08-13 (**~10.6 days**) | created 2026-08-12 |
| Stored URL state | expired (`403 Request has expired`) | expired |
| Source re-mint | ✅ | ✅ |
| Download | ✅ | ✅ |
| Progress | **100** | **`rendering:6` → `ready:100`** |
| Final status | `ready` | `ready` |
| `failureReason` | `null` | `null` |
| Output | 3,493,927 B, HTTP 200 | present |
| Elapsed | ~26s | ~30s |

`0db41079` captured a real intermediate progress value (`rendering:6`), which is
the direct refutation of the progress-0 symptom.

**Output inspection** (`4c16cef2`, downloaded and probed):

| | |
|---|---|
| Container | MP4, 22.59s |
| Video | h264 High, yuv420p, 404×720 (DAR 101:180 ≈ 9:16), 29.97 fps |
| Audio | **AAC LC, 44.1 kHz, stereo** ✅ |
| Framing | speaker sensibly framed in portrait crop ✅ |
| Watermark | `drawtext` "Clipiro" burned in on every frame ✅ |
| Captions | none expected (`hasCaptions: false`) |

**Transcription / Rekognition — NOT REACHED, by design.** `rerenderJob` reuses
the clip's persisted transcript and `loadFaceTimeline`'s stored timeline; it
makes no live STT or Rekognition call. The `warnings`
`["transcription_failed", "reframe_failed"]` on `4c16cef2` are written only by
the **batch** job (`lib/autoclip-pipeline.ts` ~807–946), never by `rerenderJob`,
so they are persisted from the original 2026-08-13 run — not produced by this
verification. They do demonstrate the intended degradation: both stages failed
in that original run and the project still completed with usable output.

**Duration note, not a P0-3 fault:** output is 22.59s against a nominal
350→395s (45s) clip window. This matches the separately documented
source-duration metadata mismatch (`Asset.durationSec` recorded ~2× the real
file length elsewhere in this codebase). Recorded, not conflated with P0-3, and
not fixed here.

## Credit Verification

| Run | Before | Charged | Refund | After | Correct |
|---|---|---|---|---|---|
| `4c16cef2` re-render (paid, `rerenderCount` 1) | 776 | 1 | 0 | 775 | ✅ exactly one spend |
| `0db41079` re-render (first re-render is free) | 775 | 0 | 0 | 775 | ✅ no spend, no refund |

No duplicate spend, no refund on success, no double refund.

**Ledger-level confirmation was not possible.** `CreditTransaction` has no read
API and production DB credentials were deliberately not accessed. Evidence here
is balance-level plus the automated coverage below.

**Retry / double-refund after the fix:** not reproducible in production, because
neither verification run failed. Covered by automated evidence instead, as
instructed — deliberately inducing a production failure was not required:

- `lib/job-queue.test.ts` — a `NonRetryableError` is not retried; an ordinary
  error is retried 3×.
- `lib/autoclip-pipeline.test.ts` — the failure path throws `NonRetryableError`,
  so the queue cannot retry a failure it has already refunded.
- `lib/autoclip-rerender.test.ts` — pins the mechanism: repeated refunds walk
  backwards through **distinct** refIds (`:2`, `:1`, `:0`), which is exactly why
  the retry had to be stopped rather than relying on `restoreSpend`'s per-refId
  idempotency.

## FailureReason

- Successful runs: `failureReason = null` ✅
- Failure path: persists a sanitized category
  (`source_expired`, `source_download_failed`, `probe_failed`,
  `transcription_failed`, `render_failed`, `storage_failed`,
  `unknown_pipeline_failure`) and is asserted not to leak raw errors, URLs,
  signatures or temp paths.
- **Not observed live** — no genuine failure occurred during verification.
  Covered by test.

The forbidden state — `status = failed`, `progress = 0`, `failureReason = null`
— can no longer be produced by this path.

## Known Shared URL Bugs (out of scope, not fixed)

The same defect — treating a 6-hour presigned URL as durable state — exists
elsewhere and will fail identically for any project older than six hours:

| Surface | Location | Status |
|---|---|---|
| split-screen | `app/api/generate/split-screen/route.ts` (~65, 78, 139) | **Not fixed** — documented only |
| streamer-video | `app/api/generate/streamer-video/route.ts` (~47) | **Not fixed** — documented only |

Both download `project.uploadedVideoUrl` directly. `lib/source-url.ts`'s
`freshSourceUrl()` is the ready-made remedy when those are scheduled.

**Recommended invariant:** persistent database state should store durable object
identity (the S3 key), never a time-limited presigned URL as the source of
truth. The presigned URL is a view, not a fact.

## Historical Balance Correction

```
Historic +2 anomaly proven: YES
Automatic correction performed: NO
```

No balance was mutated and no admin adjustment created. Correction requires
explicit approval and a ledger review.

## P0-1 Regression

**NO.** Editor captions were not touched. AutoClip re-render does not invoke the
shared transcription path, so this run neither exercises nor threatens it.

## P0-2 Regression

**NO.** The re-render rendered through the pinned ffmpeg 6.0-static runtime and
produced a valid h264/AAC MP4 with the `drawtext` watermark burned in — no
missing-filter error, no exit 8. No runtime, checksum, resolver or `-threads 1`
code was touched.

## Final P0-3 Status

**FIXED.**

Two previously-failing projects with long-expired upload URLs now re-mint fresh
source access, download successfully, advance past progress 0 through real
stages, complete at 100 with `failureReason = null`, and produce valid playable
output. One successful operation charges exactly once; the retry-driven
double-refund path is closed at the queue boundary and covered by tests.
