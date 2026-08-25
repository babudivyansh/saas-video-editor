# Clipiro Source URL Tenant Isolation Incident

## Severity

**P0 / Critical Security** — cross-tenant media access via server-mediated
credential use. Recorded separately from the stale-presigned-URL reliability
incident (`docs/stale-presigned-url-cross-product-fix.md`), which shares a root
cause but not an impact class.

## Vulnerable Production Behavior

Between the AutoClip P0-3 fix shipping and PR #181 merging
(`a8679e8`, merged 2026-08-25T15:18:23Z), production `main` contained:

```ts
export async function freshSourceUrl(storedUrl: string): Promise<string> {
  const key = s3KeyFromStoredUrl(storedUrl);
  if (!key) return storedUrl;
  return getAssetReadUrl(key);          // signs whatever key it parsed
}
```

No ownership context was accepted, so none could be checked. The helper signed
any key it could parse out of the stored URL using Clipiro's own AWS
credentials.

## Attack Preconditions

1. An authenticated Clipiro account (no special role or tier required).
2. Knowledge of another tenant's S3 object key. The key format is
   `uploads/<userId>/<uuid>.<ext>`, so this requires knowing or obtaining both
   the victim's user id and the object UUID — it is not guessable at scale, and
   we have **no evidence** any party did so.
3. A write to `Project.uploadedVideoUrl`, which is client-settable through:
   - `POST /api/v1/projects` — validates only that the value parses as an
     `https:` URL;
   - `POST /api/projects` — no validation of the field at all;
   - `PATCH /api/projects/[id]` — `uploadedVideoUrl` is on the allowlist and no
     ownership check is applied (the handler only clears `faceTimeline`).
4. Triggering any pipeline that resolved the project's source.

## Data Accessible

Stated strictly as verified, no further:

- The **source video object** named by the supplied key would have been fetched
  by the server and used as the render input, so its content could be returned
  to the attacker inside their own rendered output.
- Access was limited to objects in Clipiro's own S3 bucket, because
  `getAssetReadUrl()` always signs against the configured bucket regardless of
  the host named in the supplied URL.
- The grant was a time-limited GET for the single named key. No listing, no
  write, no delete, no credential disclosure.

**Not established:** whether any such request ever occurred. This session had
no production database, S3, or log access, so no exploitation search was
performed. The vulnerability is proven by code and reproduced against the
pre-fix implementation; actual abuse is **unknown, not disproven**. Confirming
that requires an S3 access-log / CloudTrail review, which remains outstanding.

## Root Cause

A presigned URL was treated as an *identity* rather than an *access grant*.
Re-minting was introduced (correctly) to fix expiry, but it converted a
previously harmless condition into a privilege escalation:

- **Before re-minting:** a URL naming another tenant's key carried no valid
  signature, so S3 answered 403. The stored value was inert.
- **After re-minting, before the gate:** the server re-signed that key with its
  own credentials, turning an inert string into working access.

The defect was not in URL parsing — parsing worked exactly as intended. It was
that nothing asked *who owns the result* before signing it.

## Affected Call Sites

All resolved through the single helper, so all were affected while it was
un-gated:

| Call site | Status on `main` today |
| --------- | ---------------------- |
| `lib/autoclip-pipeline.ts:704` (analysis download) | gated — passes `project.userId` |
| `lib/autoclip-pipeline.ts:1686` (re-render) | gated — passes `project.userId` |
| `lib/autoclip-pipeline.ts:1825` (re-render) | gated — passes `project.userId` |
| `app/api/generate/split-screen/route.ts:85` | gated — passes `project.userId` |
| `app/api/generate/streamer-video/route.ts:63` | gated — passes `project.userId` |
| `app/api/projects/[id]/clips/[clipId]/preview-frames/route.ts:46` | gated — passes `auth.userId` |
| `lib/asd.ts` (ASD presign + Rekognition) | gated — classifies before either privileged step (this pass) |

Verified: no single-argument `freshSourceUrl(...)` call remains anywhere in the
repository.

## Fix

PR #181. The helper now requires the owner's identity and proves ownership
before issuing any signature:

```ts
export async function freshSourceUrl(storedUrl: string, ownerUserId: string): Promise<string>
```

`ownerUserId` is always read server-side — `project.userId` from a row the
server loaded, or `auth.userId` on the ownership-scoped preview route. It is
never taken from the request body.

When ownership cannot be proven the stored URL is returned **unchanged**. That
is precisely the pre-re-minting behaviour: the download fails on its own if the
URL is expired or foreign. The gate can therefore never grant access the caller
did not already have, and it cannot break a legitimate flow that previously
worked.

## Ownership Model

Two accepted proofs, in order of authority:

1. **An `Asset` row for `(userId, s3Key)`** — the authoritative database record.
   This covers legacy sources that predate the current upload path, which
   `scripts/backfill-project-source-assets.ts` populated.
2. **Path-prefix containment** — the key contains the user's id as a full path
   segment, which is how uploads are constructed (`uploads/<userId>/<uuid>.<ext>`).

On the prefix proof's soundness, since it is the weaker of the two:

- It is implemented as `key.split("/").includes(userId)` — **segment equality**,
  not `startsWith`. A lookalike such as `uploads/<victimId>x/...` does not
  satisfy it, and neither does `user-10` satisfying `user-1`. Both are covered
  by tests.
- The segment is a server-generated UUID that the client never chooses. Upload
  keys are built server-side as `sanitizeS3Key(\`uploads/${auth.userId}/…\`)`,
  so a user cannot cause an object to be created under another tenant's prefix.

The prefix proof is therefore unforgeable *given* that all writers construct
keys server-side, which is true today. The `Asset`-row proof is nonetheless the
stronger invariant, and the long-term direction is to rely on it alone — see
[Remaining URL Risks](#remaining-url-risks).

## Regression Tests

`lib/source-url.tenant-isolation.test.ts` — 6 tests against a **real database**
with real `User`, `Asset` and `Project` rows for two real tenants, calling the
real resolver. Ownership is not mocked; there is no `isOwner = false` stub.
Presigning is a local operation, so a mint either genuinely happens (signature
present) or genuinely does not.

- tenant A referencing tenant B's object → **denied**, stored URL returned
  untouched, no signature issued;
- same input as tenant B → **allowed**, fresh signature, dead signature gone;
- tenant A owning *other* media still denied for B's key (ownership is
  per-object, not per-user);
- prefix-lookalike segment rejected;
- an `Asset` row belonging to the other tenant rejected.

**Pre-fix/post-fix delta, executed:** the pre-#181 resolver was restored from
git history (`4873fd2^:lib/source-url.ts`) and run against the identical input.
It **minted a usable presigned URL for the victim's key** — the exploit
reproduces on the old code — while the current resolver refused the same input.
The regression test therefore genuinely fails on vulnerable `main` and passes
on the fix.

Plus `lib/source-url.test.ts` (14) and the tenant cases in both route suites,
which assert a non-owning project triggers no minting at all.

## Deployment

PR #181 merged to `main` as `a8679e8` on 2026-08-25T15:18:23Z and reported
deployed by the operator. `https://clipiro.com/api/health` returns
`{"status":"ok","db":true,"redis":true}`.

**DEPLOYMENT IDENTITY NOT AVAILABLE.** The health endpoint exposes no build or
commit identifier, so no session has been able to independently confirm which
commit production is running. This was investigated for a fix and deliberately
left unchanged:

- there is no deploy step in `.github/workflows/ci.yml` — deployment is manual
  / external — so nothing injects a commit SHA;
- there is no Dockerfile or deploy manifest that could carry one;
- `lib/env.ts` declares no build/commit/version variable.

Nothing trustworthy is available to expose, and inventing one — hardcoding a
SHA, or shipping a field that is always absent — would be worse than the gap it
papers over. The fix belongs at the deploy step: have it export the commit SHA
(e.g. `CLIPIRO_BUILD_ID`) into the runtime environment, after which surfacing
it from `/api/health` is a two-line change. Recommended, not blocking.

## Production Security Verification

**Not performed.** This session had no production database access
(`DATABASE_URL` is `localhost:5432`), no production tenant credentials, and no
admin access. A live two-tenant exploit attempt was therefore impossible.

What was done instead, which the release gate permits as an equivalent: the
security test above runs against the exact deployed commit with a real
database, and the exploit was demonstrated to succeed on the pre-fix code and
fail on the deployed code.

## Split Screen Verification

**Not performed** — requires a production tenant login. Code-level state is
correct (gated resolver, sanitized `failureReason`, guarded refund) and the
route suite passes.

## Streamer Verification

**Not performed** — same reason.

One finding from reading the path, independent of production:
`runStreamerFFmpeg` builds its drawtext filter with **no `fontfile=` and no
`font=`**, and the `fontname` selected by `styleIndexToDrawtext` (Arial, Impact,
Times New Roman) is computed and then **silently discarded**. Consequences:

1. Every Streamer title renders in fontconfig's default family, so the 16 title
   styles differ only in colour and size — a latent correctness bug regardless
   of whether rendering succeeds.
2. Whether it renders at all depends on the production host resolving a default
   font. The build-time gate (`scripts/verify-render-runtime.ts`) does **not**
   prove this: its drawtext smoke test passes an explicit
   `fontfile=resolveFontFile("Poppins")`.

Locally (Windows, bundled FFmpeg 6.1.1) the no-fontfile filter renders fine, but
that is not evidence about the Linux production host. If a production Streamer
render fails with `Cannot find a valid font` / `No usable font file found`, that
is a **Streamer font-resolution bug** — not a P0-2 regression — and the fix is
to pass `fontfile` explicitly, as every other render path already does.

## Preview Frames Verification

**Not performed** in production. Code-level: the route resolves through the
gated helper and was already ownership-scoped (`findFirst({ id, userId:
auth.userId })`), so a cross-tenant reference cannot mint.

## AutoClip Regression

Suites green: `autoclip-pipeline` (29), `autoclip-failure`, `autoclip-refund`,
`autoclip-rerender`, plus credits. All three AutoClip call sites pass
`project.userId`. No production re-run was possible.

## Residual ASD Authorization Site

### Previous behavior

`lib/asd.ts` → `getFaceTimeline(userId, videoUrl)` performed **no ownership
check**. It spent Clipiro's credentials on whatever object `videoUrl` named,
in two distinct ways:

- **ASD:** `getAssetReadUrl(parseS3Url(videoUrl).key, 3600)` minted a presigned
  GET and handed it to the external GPU service.
- **Rekognition fallback:** `detectFaceTimeline(videoUrl)` passed
  `Bucket`/`Name` straight to `StartFaceDetectionCommand`, which reads the
  object using **our own IAM role** — a dead signature offers no protection
  against this at all.

`videoUrl` arrives from `lib/autoclip-pipeline.ts:773` as
`project.uploadedVideoUrl`, which is client-settable. The `userId` argument was
already present but fed only `shouldUseAsd()`, a tier/rollout flag — never a
permission.

### Why execution-order protection was insufficient

The path was not exploitable in the shipped AutoClip flow, because the
ownership-gated source download at line 704 runs earlier in the same `try`
block and throws first on a foreign key. That is a coincidence of ordering, not
an authorization boundary. It would have been reopened by any of:

- reordering the pipeline so face detection starts before the download
  (explicitly desirable — the comment at line 760 notes Rekognition is the
  longest-running call and is deliberately kicked off early);
- adding a second caller that does not download first;
- calling the exported function directly.

Correct classification: **latent authorization bypass / defense-in-depth
failure**, not a confirmed exploitable vulnerability.

### Fix

`lib/source-url.ts` gained `classifySource(storedUrl, ownerUserId, expiresInSec?)`,
which returns a three-way verdict rather than a URL:

- `owned` — our storage, ownership proven; carries the durable key and a fresh
  grant;
- `foreign` — our storage, ownership **not** proven; every privileged use must
  refuse;
- `external` — not our storage; no Clipiro credential is involved, so callers
  may pass it through.

The three-way answer is the point. "Fall back to the stored URL" is only safe
for a caller whose privileged step is *fetching that URL*; a caller that hands
the derived key to an AWS API on our credentials needs `foreign` and `external`
to be distinguishable. `freshSourceUrl` is now a thin wrapper
(`owned ? url : storedUrl`), so the six existing call sites are behaviourally
identical — same call shape, same fail-safe semantics.

`getFaceTimeline` now classifies **first**, before either privileged step:
`foreign` returns an empty timeline (a static centre crop — the module's
existing graceful degradation), and Rekognition runs only for `owned` media.
External sources still reach ASD directly, so legitimate third-party media is
unaffected. The one-hour GPU grant was preserved by threading the TTL through
`classifySource`; the shared resolver's 6-hour default would otherwise have
silently widened it.

### Regression proof

`lib/asd.tenant-isolation.test.ts` — 5 tests against a real database with real
two-tenant rows, calling `getFaceTimeline` **directly**. No AutoClip download
runs first, which is precisely the point: the refusal must come from this
function's own check.

- tenant A on tenant B's object → empty timeline, **no** presigned URL minted,
  **no** GPU call, **no** Rekognition call;
- tenant A on its own object → mints, calls ASD with the fresh URL, reaches
  Rekognition;
- an explicit "reordering cannot reopen this" case that hammers the function
  the way a reordered pipeline or a new caller would, asserting all three
  privileged operations stay un-called;
- a third-party URL still reaches ASD, and never spends our IAM;
- prefix-lookalike segment refused.


## Remaining URL Risks

1. **`lib/asd.ts:66` is an un-gated re-mint site.**
   `getFaceTimeline(userId, videoUrl)` calls
   `getAssetReadUrl(parseS3Url(videoUrl).key, 3600)` with **no ownership
   check** — its `userId` argument feeds only `shouldUseAsd()`, a tier/rollout
   flag. It is invoked from `lib/autoclip-pipeline.ts:773` with the
   client-settable `project.uploadedVideoUrl`, and the resulting signed URL is
   handed to the GPU/ASD service; the Rekognition fallback
   (`detectFaceTimeline`) takes the same URL.

   **Not confirmed exploitable**, and the reason matters: the gated source
   download at line 704 runs earlier in the same `try` block, so a foreign key
   fails there and the pipeline throws before reaching line 773. The path is
   protected by *execution order*, not by an authorization check — which is
   exactly the fragile arrangement that produced this incident. It should be
   gated on its own merits. Deliberately not changed here (out of scope for a
   verification pass, and it touches AutoClip behaviour).

2. **Client-controlled URLs remain writable** to `uploadedVideoUrl` on three
   routes. This is intentional — external source URLs are a supported feature —
   and the required invariant now holds at the re-mint boundary:
   `client-controlled URL ≠ authorization to Clipiro storage`. Enforcing it at
   the write boundary instead would be stronger defence in depth.

3. **No exploitation search was performed.** See
   [Data Accessible](#data-accessible).

4. **Persisted-presigned-URL storage rule (long-term invariant, not changed
   here).** Persistent state should store a durable identity — asset id, object
   key, storage key — and presigned URLs should remain ephemeral access
   artifacts, never a column that later operations trust. `uploadedVideoUrl`
   still holds a URL; the resolver compensates by recovering the key from it.
   A schema change is not required by this task, but the direction is to store
   `s3Key`/`assetId` on the project and let the URL column become a cache.

## Historical Exploitation Review

**Status: INSUFFICIENT TELEMETRY.**

### Telemetry reviewed

- **S3 server access logging on `saas-video-editor-assets` (ap-south-1):
  DISABLED.** Checked directly via `GetBucketLogging` with the application's
  own credentials — the response carries no `LoggingEnabled` block. This is the
  primary place a per-object `GET` would have been recorded, and it was not
  recording during the exposure window.
- **CloudTrail data events: NOT DETERMINED.** `@aws-sdk/client-cloudtrail` is
  not a dependency of this project and a dependency was not added to run a
  probe. S3 object-level data events are **off by default** and billed
  separately, so the prior probability that they were enabled is low — but that
  is an inference, not a measurement, and it is recorded as such.
- **Application logs: no usable signal for the historical window.** The
  `refusing to mint a source URL…` line only exists *because of* the fix, so it
  cannot describe behaviour from before the fix. Post-fix, any occurrence is a
  **blocked** attempt and is worth investigating on its own.
- **Database ownership scan: NOT RUN against production.** No production
  database access. A read-only scanner was written for whoever has it —
  `scripts/scan-cross-tenant-sources.ts` — and validated against a development
  database. It writes nothing.

### Retention / gaps

The decisive gap is the disabled S3 access logging: object-level `GET` history
for the exposure window **does not exist and cannot be reconstructed**. No
later investigation can recover it.

### Conclusion

**INSUFFICIENT TELEMETRY.** This is now an evidence-backed classification
rather than an unexamined one: the primary object-level log was measured and
found disabled. `NOT EXPLOITED` remains unavailable and must never be recorded
— with no access log, non-exploitation is not a conclusion the evidence can
support in either direction.

What is still worth doing, and needs no AWS access:
`scripts/scan-cross-tenant-sources.ts` against a production read replica. A
cross-tenant attempt requires a `Project` whose `uploadedVideoUrl` names a key
its owner cannot be shown to own, and **that state is still in the database**,
unaffected by the missing logs. A hit there proves suspicious *persisted state*
existed; it still would not prove the bytes were read.

**Recommendation:** enable S3 server access logging (or CloudTrail S3 data
events) on the media bucket. This incident could not be investigated after the
fact, and the next one will have the same problem until that changes.

The standalone checklist is at
`docs/source-url-exploitation-review-checklist.md`.

## Asset Duration Follow-Up

Unchanged and deliberately separate: `Asset.durationSec` = 45s against a real
source duration of 22.56s, because client-supplied duration is trusted at
upload. Affects timeline bounds, split calculations, trimming, render windows,
AutoClip planning and duration UX. The fix should make server-side probing
authoritative. **Not started.**

## Final Status

**Original incident (un-gated `freshSourceUrl`): FIXED**, on the release gate's
sanctioned alternative — the cross-tenant exploit is proven denied by a
security test tied to the deployed commit, and proven to succeed against the
pre-fix code. Two qualifications stand: production deployment of `a8679e8` is
taken on the operator's word, and no exploitation search has been done.

**Residual authorization hardening (ASD): FIXED in code, not yet deployed.**
`getFaceTimeline` now proves ownership itself, before both the presign and the
Rekognition job, and a direct-invocation regression test proves the refusal
does not depend on AutoClip's earlier download.

**Streamer font resolution: FIXED in code, production visual check
outstanding.** Titles now pass an explicit, deterministically resolved
`fontfile`; automated renders prove three families reach FFmpeg and produce
different pixels. Whether the production host resolves the system faces or
takes the bundled fallback still needs one render inspected by eye.

**Stale-URL cross-product reliability issue: FAILED / OPEN.** The production
old-project runs for Split Screen, Streamer Video and preview frames have still
not been executed, and the gate requires them. No automated evidence
substitutes for those runs.

**Historical exploitation: NOT REVIEWED.**
