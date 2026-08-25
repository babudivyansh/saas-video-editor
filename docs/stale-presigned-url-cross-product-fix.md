# Clipiro Stale Presigned URL Cross-Product Fix

Status: **code complete, production verification PENDING** (see
[Production Verification](#split-screen) sections — the local evidence is
complete; the live old-project runs have not been executed from this session).

## Background

`Project.uploadedVideoUrl` stores the URL the browser got back when it uploaded
the source video. When `CDN_BASE_URL` is unset, `getAssetReadUrl()` returns a
**presigned** S3 URL minted with `X-Amz-Expires=21600` — six hours. That value
is then persisted on the project and, historically, reused verbatim by every
later processing job.

A presigned URL is an *access grant*, not an *identity*. Persisting one as the
source of truth means the record decays: the object is still there, the key is
still correct, but the signature is dead six hours later.

## AutoClip Proven Incident

P0-3, verified in production. Projects roughly ten days old failed on the very
first pipeline step:

```text
403 AccessDenied
Request has expired
```

A URL signed 2026-08-13 was still being presented to S3 on 2026-08-24. The run
died before any progress was written, so neither the user nor an operator could
see why. AutoClip was fixed by recovering the durable S3 object key from the
stored URL and minting fresh, operation-scoped access at use time.

## Shared Architectural Cause

The invariant that was broken:

```text
persistent media identity / S3 key
  → generate fresh access URL for THIS operation
  → download / process media
```

What the code did instead:

```text
presigned URL saved days ago
  → reuse indefinitely
```

The object key is the stable part of the URL; only the signature rots. That is
what makes recovery possible for historical rows that have no separate key
column.

## Repository Search

Every `downloadFile()` / media-fetch call site was classified by whether the URL
it fetches was **persisted earlier** and can therefore be older than six hours.

The decisive fact for most of the codebase: `uploadFileToS3()`,
`uploadBufferToS3()` and `s3KeyToPublicUrl()` all return an **unsigned**
`https://{bucket}.s3.{region}.amazonaws.com/{key}` URL. So `Clip.videoUrl`,
`Project.videoUrl` and `Asset.url` are durable identities that never expire —
they are not affected by this bug class. Only values that originate from
`getAssetReadUrl()` / `getPresignedUrl()` **and are then written to the
database** carry the defect.

| Surface | Persistent URL reused later? | Risk |
| ------- | ---------------------------- | ---- |
| AutoClip pipeline (`lib/autoclip-pipeline.ts` ×3) | `uploadedVideoUrl` — **was** reused | **FIXED** (P0-3) |
| Split Screen (`app/api/generate/split-screen`) | `uploadedVideoUrl` — **was** reused | **CONFIRMED BUG → FIXED** |
| Streamer Video (`app/api/generate/streamer-video`) | `uploadedVideoUrl` — **was** reused | **CONFIRMED BUG → FIXED** |
| Clip preview frames (`…/clips/[clipId]/preview-frames`) | `uploadedVideoUrl` — **was** reused | **CONFIRMED BUG → FIXED** (found by this audit) |
| Editor render (`app/api/editor/render` → `lib/editor/render-job.ts`) | No — mints per render from `Asset.s3Key` at submit time | SAFE (see note) |
| Editor captions (`app/api/editor/captions`) | Reads `Asset.url`, which is an **unsigned** permanent URL | SAFE |
| Clip scheduler (`lib/clip-scheduler.ts`) | `Clip.videoUrl` — unsigned render output | SAFE |
| Clip publish (`…/clips/[clipId]/publish`) | `Clip.videoUrl` — unsigned render output | SAFE |
| AutoClip dub (`lib/autoclip-dub.ts`) | `Clip.videoUrl` — unsigned render output | SAFE |
| Compile / Text Video / Reddit Video | `bgVideoUrl`, `musicUrl`, `voiceAudioUrl` from the request at submit time | SAFE (not persisted-then-reused) |
| Stock import (`app/api/editor/stock/import`) | Provider `downloadUrl`, used immediately | SAFE |
| AutoClip music bed (`lite.music.url`) | Library URL, external host; failure is non-fatal (renders without music) | NEEDS REVIEW |
| AutoClip B-roll (`clip.brollWindows[].url`, `clip.brollUrl`) | Persisted stock-provider URL, external host; failure is non-fatal (window skipped) | NEEDS REVIEW |
| Admin render diagnostics (`…/render-diagnostics/reproduce`) | URL supplied per request by an operator | SAFE |

Note on editor render: the signed URLs are minted at submit time and handed to
the job, not persisted — correct in kind. The residual risk is only that a job
sitting in the queue longer than six hours would start with an already-expired
grant. That is a queue-latency concern, not the stale-persist defect, and is
listed under [Remaining Risks](#remaining-risks).

The two NEEDS REVIEW rows are persisted URLs on external hosts (not our
presigned S3), and both degrade gracefully rather than failing the render. They
were deliberately **not** modified — no evidence of the identical flaw.

## Split Screen

### Old Behavior

`renderJob` downloaded `project.uploadedVideoUrl` directly. Any project older
than six hours failed at the download with `403 AccessDenied — Request has
expired`. The project was marked `failed` with **no `failureReason`**, so the UI
could only say something generic and an operator had nothing to go on.

### Root Cause

The persisted presigned URL was treated as the durable source of truth. Same
defect as AutoClip P0-3, in a second copy of the download logic.

### Fix

- Source resolution now goes through the shared `freshSourceUrl(storedUrl, project.userId)`.
- Failures are classified through `classifyProjectRenderFailure()` and the
  **sanitized** message is persisted to `Project.failureReason`.
- Each failure-path bookkeeping step (status write, refund) is individually
  wrapped, so none can mask the original error or abort the ones after it.
- The enqueue claim now also clears `failureReason`, so a fresh run never shows
  the previous attempt's reason.

### Tests

`app/api/generate/split-screen/route.test.ts` (6) drives the real job handler
through the real resolver:

- old project processes successfully with a re-minted source; the stale URL and
  any `X-Amz-Signature` are provably never fetched;
- success charges exactly once, with no refund;
- source-download failure persists a sanitized `failureReason` that leaks no
  URL, signature, bucket or raw error, and nets zero charge;
- the refund still happens when the failure-status write itself throws;
- the claim clears a previous `failureReason`;
- a project whose owner cannot be proven to own the key gets **no** fresh
  signature (tenant isolation).

### Production Verification

PENDING — not executed from this session. See
[Remaining Risks](#remaining-risks).

## Streamer Video

### Old Behavior

Identical: `downloadFile(project.uploadedVideoUrl, …)`, same 403 after six
hours, same missing `failureReason`.

### Root Cause

Same as Split Screen — a third copy of the same reuse pattern.

### Fix

Same three changes as Split Screen, using the same shared resolver and the same
shared classifier. Title rendering (`drawtext`) was **not** touched.

### Tests

`app/api/generate/streamer-video/route.test.ts` (7) — the Split Screen set plus:

- the drawtext title still reaches FFmpeg with the expected `titleText` and
  options, from the file fetched via the fresh URL;
- render failure (`FFmpeg exited…`) nets zero charge.

### Production Verification

PENDING — not executed from this session. The live run is also the intended
opportunity to confirm the Streamer `drawtext` path against the pinned FFmpeg
6.0 runtime. If the title fails for want of a system font, that is a
**Streamer font-resolution bug**, reported separately — it is not a P0-2
reopening.

## Shared Source Resolver

`lib/source-url.ts` — one primitive, now used by AutoClip (×3), Split Screen,
Streamer Video and clip preview frames. No second implementation was created.

```text
stored URL → recover durable S3 key (query string discarded)
           → prove the owner owns that key
           → mint a fresh, operation-scoped signed URL
```

`s3KeyFromStoredUrl()` handles the three URL shapes this codebase emits
(virtual-hosted S3, path-style S3, CDN) and returns `null` for anything else
rather than inventing a key.

**Nothing is written back.** The fresh URL lives only for the duration of the
operation; `uploadedVideoUrl` is left exactly as it was. No new six-hour
countdown is started, and the durable identity remains the S3 key.

## Security / Tenant Isolation

`Project.uploadedVideoUrl` is **client-settable** — both `POST /api/v1/projects`
and the project PATCH allowlist accept an arbitrary https URL. Before
re-minting existed this was harmless: a URL naming another tenant's key carries
no valid signature, so S3 answers 403.

Minting turns that dead end into real cross-tenant access unless it is gated.
`freshSourceUrl()` therefore takes the owner's `userId` — read server-side from
`project.userId` (or the authenticated user on the ownership-scoped preview
route), never from the client — and proves ownership before issuing any
signature:

1. an `Asset` row for `(userId, s3Key)` — the authoritative record; or
2. the key sits under the user's own prefix (`uploads/<userId>/…`).

When ownership cannot be proven it returns the stored URL **unchanged**, which
is exactly the pre-re-minting behaviour — so the resolver can never grant access
the caller did not already have.

Covered by tests: refuses another tenant's key in our own bucket; accepts a
legacy key proven by an `Asset` row; refuses one whose `Asset` row belongs to
someone else; rejects a `userId`-lookalike path segment (`user-10` must not
satisfy `user-1`). Both route suites additionally assert that a non-owning
project triggers no minting at all.

## Retry and Credit Integrity

Per logical operation: **at most one net spend**.

- One spend at enqueue, `refId = split-screen:{projectId}` /
  `streamer-video:{projectId}`, guarded by an atomic status claim so a
  double-submit charges once and returns 409.
- `restoreSpend()` computes what is refundable as the **net** of all ledger rows
  for that `refId`. A second refund of the same refId therefore pays out zero —
  the `failure → refund → retry → refund` loop cannot mint credits.
- A user-initiated retry is a new POST: it spends again and, if it fails,
  refunds again. Net stays correct (`success = −1`, `failure = 0`).
- These job handlers **catch** their own errors and never rethrow, so the
  in-process queue's `MAX_RETRIES` path is never entered — a failure refunds
  exactly once per submission. Automatic retry cannot double-refund here.
- Hardened this pass: the refund previously sat behind an unguarded status
  write. If that write threw, the refund was skipped and the user stayed
  charged for a render that produced nothing. Both refund and status write are
  now independently guarded, with a regression test for each surface.

No historical balances were mutated by this work.

## Other Presigned URL Uses

See the [Repository Search](#repository-search) table. One additional
**CONFIRMED BUG** was found and fixed: the clip preview-frames route
(`app/api/projects/[id]/clips/[clipId]/preview-frames/route.ts`) passed
`project.uploadedVideoUrl` straight into `renderPreviewFrames()` → `downloadFile`,
so previewing any project older than six hours hit the same 403. The route was
already ownership-scoped, involves no credits, and the fix is a one-line reuse
of the same resolver. It is called out here rather than folded in silently.

## Streamer Font Resolution

### Old behavior

`runStreamerFFmpeg` computed a font family from the style index
(`styleIndexToDrawtext` → Arial / Times New Roman / Impact) and then **threw it
away**. The emitted filter carried neither `fontfile=` nor `font=`:

```
drawtext=text='…':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=h*0.08:…
```

Two consequences:

1. **All 16 title styles rendered in the same face** — whatever fontconfig
   chose as its default. The styles differed only in colour and size, so the
   font half of every style was decorative metadata that never reached FFmpeg.
2. **Rendering depended on the host having a usable default font.** On a
   minimal Linux container with no fonts installed, drawtext fails outright
   (`Cannot find a valid font for the family Sans` / `No usable font file
   found`). The build-time gate (`scripts/verify-render-runtime.ts`) does *not*
   cover this case: its drawtext smoke test passes an explicit
   `fontfile=resolveFontFile("Poppins")`, so it proves the filter exists, not
   that a default family resolves.

This is a Streamer rendering bug, not a P0-2 runtime issue. The pinned runtime
supports `drawtext` — it was simply never told what to draw with.

### Fix

Font selection is now deterministic and explicit, reusing the authoritative
resolver the editor renderer already uses (`resolveFontFile` in
`lib/editor/filtergraph.ts`) rather than adding a second font path:

```
drawtext=text='…':fontfile='<resolved path>':fontsize=…
```

`streamerFontFile(family)` wraps that resolver with one deliberate difference:
`resolveFontFile` throws when nothing usable exists, and a throw must not turn
a render that previously produced *something* into a hard failure. An
unavailable family therefore falls back to `public/fonts/Poppins-Bold.ttf` —
a file that ships in this repository, so it is present on every host regardless
of what the OS has installed — and logs that it did so. The one thing that
never happens any more is handing drawtext no font and letting the host decide.

Path escaping goes through the same `escapeFilterPath` the editor uses (now
exported rather than duplicated).

### Styles tested

All **16**, automatically:

- every style's family resolves to a file that exists on disk;
- the families actually referenced are exactly `{Arial, Times New Roman,
  Impact}`, and each resolves;
- distinct families resolve to distinct files, so styles cannot silently
  collapse onto one face;
- an unknown family falls back to the bundled Clipiro font, not the OS.

Beyond string inspection, three **real renders** run through the pinned runtime
— one per family — and must complete without a font error. The proof that the
font is actually applied is a controlled byte comparison: the same font
rendered twice is byte-identical, while Arial and Times New Roman differ. Since
text, size, colour and input are held constant, the difference can only be
glyphs. (Without the identical-control, a difference could have been mp4
metadata and would have proved nothing.)

### Production visual verification

**Not performed** — no production tenant credentials were available. What the
automated evidence does and does not cover:

- covered: the filter now carries an explicit, existing font file; the render
  succeeds for all three families on the pinned runtime; different families
  produce different pixels.
- not covered: that a production Streamer render looks right to a human, and
  that the production host resolves the *system* families (Arial → Liberation
  on Linux) rather than taking the bundled fallback. If the production host
  lacks Liberation/DejaVu, every style will render in Poppins — deterministic
  and legible, but not the intended face. Confirming that needs one production
  render inspected visually, comparing two materially different styles.


## Production Verification — Consolidated Status

As of the closure pass following PR #182 (`3230ee5`, merged 2026-08-25).

**Every production run required by the release gate is still NOT RUN.** The
blocker is unchanged and is access, not effort: this environment's
`DATABASE_URL` points at `localhost:5432`, there are no production tenant
credentials, and there is no admin login. Creating accounts to obtain them is
not something this session will do.

| Gate item | Status | Why |
| --------- | ------ | --- |
| Split Screen old-project run | **NOT RUN** | no production tenant |
| Split Screen output probe (ffprobe/frames) | **NOT RUN** | depends on the run above |
| Split Screen credit effect | **NOT RUN** | no production balance to observe |
| Streamer old-project run | **NOT RUN** | no production tenant |
| Streamer output probe | **NOT RUN** | depends on the run above |
| Streamer intended-font visual check | **NOT RUN** | depends on the run above |
| Streamer credit effect | **NOT RUN** | no production balance to observe |
| Preview-frames old-project run | **NOT RUN** | no production tenant |
| Historical DB ownership scan | **NOT RUN** | no production database |

### What *is* established, and what it is not a substitute for

Deployed-code evidence, run against the exact merged commit:

- the shared resolver refuses a foreign key and mints for an owned one, proven
  against a real database with real two-tenant rows;
- the ASD path refuses before **both** privileged operations, proven by calling
  it directly with no pipeline ordering to lean on;
- Split Screen and Streamer never fetch the stale URL, charge exactly once on
  success and net zero on failure;
- all 16 Streamer styles resolve to real font files, and three families render
  through the pinned runtime producing genuinely different glyphs.

None of that substitutes for the production runs. Automated evidence shows the
code behaves correctly given the inputs the tests supply; it cannot show that a
real ten-day-old production project, with whatever its `uploadedVideoUrl`
actually contains, completes end to end on the production host. The release
gate is explicit that only the live runs close this, and that judgement is
correct.

### Streamer font — the specific production unknown

The automated tests prove the filter now carries an explicit, existing
`fontfile`. They cannot prove *which* file production resolves. `resolveFontFile`
maps Arial / Impact / Times New Roman to Liberation or DejaVu paths on Linux;
if the production host ships neither, every style silently takes the bundled
Poppins fallback. That would be **reliable but wrong**: rendering succeeds, and
all 16 styles look alike — which is the very symptom the original bug caused.

So a production render that merely *shows a title* does not close this. Closing
it requires two materially different styles rendered and compared at the title
region, per the incident's font-control method (same font twice as a control,
then A vs B). Until then, Streamer intended-font status stays **FAILED / OPEN**
even though rendering reliability is expected to pass.


## Asset Duration Follow-Up

**Asset Metadata Integrity — separate follow-up, deliberately not fixed here.**

Verified discrepancy:

```text
Asset.durationSec = 45s
actual source duration = 22.56s
```

Client-supplied duration is trusted at upload time. This can affect timeline
bounds, split calculations, trimming, render windows, AutoClip planning and
duration UX. The fix should make **server-side media probing authoritative**
rather than trusting client metadata. It is unrelated to stale source access
and must not be mixed into this remediation.

## Remaining Risks

1. **Production verification not yet run.** The old-project Split Screen and
   Streamer runs (and the incidental Streamer `drawtext` check) remain
   outstanding. Until they pass, this issue is not eligible to be marked FIXED.
2. **Legacy rows whose ownership cannot be proven.** If a historical project's
   key is neither under `uploads/<userId>/…` nor backed by an `Asset` row, the
   resolver deliberately falls back to the stored URL and the download still
   fails. `scripts/backfill-project-source-assets.ts` exists to populate those
   `Asset` rows and is idempotent; it should be confirmed as run in production.
   This is fail-safe, not fail-open — it never grants access.
3. **Editor render queue latency.** Signed URLs are minted at submit; a job
   delayed beyond six hours would start with an expired grant. Not observed;
   the durable fix would be to resolve inside the job rather than at enqueue.
4. **Streamer font resolution** is unproven until the live render is inspected.
   A missing system font would be its own bug, not a P0-2 regression.
5. The two NEEDS REVIEW external-host URLs remain unaudited by design; both
   degrade gracefully today.
