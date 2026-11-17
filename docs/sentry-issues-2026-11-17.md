# Sentry issues — 2026-11-16 → 2026-11-17

Every unresolved issue in `clipiro/clipiro-web` with activity in the 24 hours
up to 2026-11-17, after PRs #442/#443 (earlier Sentry sweep) and #444 shipped
as release `e4809a4` (deployed 2026-11-16 21:08 UTC).

Branch: `fix/sentry-issues-2026-11-17`.

## Summary, by priority

| # | Priority | Issue | Where | Events | User impact | Status |
|---|----------|-------|-------|--------|-------------|--------|
| 1 | **P0 – owner action** | CLIPIRO-WEB-W / -V | Image Generator (Gemini model) | 2 + 2 | Every Gemini image generation fails (refunded) | Code fixed; **needs Gemini billing** |
| 2 | **P0 – owner action** | CLIPIRO-WEB-X / -Y | Photo Edit (Gemini model) | 3 + 3 | Every Gemini photo edit fails (refunded) | Code fixed; **needs Gemini billing** |
| 3 | P1 | CLIPIRO-WEB-Z | AutoClip — saving picked clips | 2 | Run failed after paid STT + Gemini; recovered on retry, which paid them again | Fixed |
| 4 | P2 | CLIPIRO-WEB-10 | AutoClip — Gemini pick | 1 | Run recovered on retry (5 clips); retry re-ran transcription | Fixed |
| 5 | P3 | CLIPIRO-WEB-5 (regressed) | Redis, proxy maintenance check at boot | 1 (34 lifetime) | None — fell back to "not in maintenance" | Fixed (noise) |
| – | – | CLIPIRO-WEB-T | URL import yt-dlp | 0 since deploy | — | Already fixed by #442; resolve after confirming |

---

## 1. Gemini image quota exhausted — Image Generator (WEB-W, WEB-V)

**What happened.** `gemini-2.5-flash-image` answered **429 "You exceeded your
current quota, please check your plan and billing details"** to every request
(2026-11-16 20:59–21:01 UTC). The route only retried 503s, logged the 429 as a
generic error (WEB-W), then the job's catch logged the resulting
`UserFacingError` again (WEB-V) — one failure, two Sentry issues. The user saw
"Image generation failed … please try again", which can never work.

**Root cause.** The Gemini API key's project is on the free tier (see the
2026-11-12 photo-edit notes). Image models have no free-tier quota, so every
call is refused. This is an account setting, not a code bug.

**Fix (code).** New `lib/gemini-image.ts` (`postGeminiImage`) used by both the
Image Generator and Photo Edit:
- reads the 429 body (`QuotaFailure.quotaId`, `RetryInfo.retryDelay`);
- a **daily or free-tier** quota → one error to Sentry naming the quota
  ("quota exhausted … needs billing or a higher quota") and the user is told
  "Gemini image is unavailable right now. Your credits were refunded — please
  pick another model.";
- a **per-minute** limit → waits Google's `retryDelay` (≤15 s) and retries,
  up to 3 attempts; still limited → "busy" message, warning only;
- 503 → backoff retry as before; still 503 → "busy", warning only (Google's
  capacity, not ours);
- the job-level "job failed" log is now a warning for a `UserFacingError`, so
  one failure is one Sentry issue.

**Owner action (required).** In Google AI Studio / Cloud console, enable
billing on the project that owns `GEMINI_API_KEY` (or raise the image quota).
Until then the Gemini image model cannot work; fal models are the only
alternative and the fal account was locked as of 2026-11-12.

## 2. Gemini image quota exhausted — Photo Edit (WEB-X, WEB-Y)

Same root cause and fix as §1 (`lib/photo-edit/providers.ts → geminiEdit` now
calls `postGeminiImage`). Events 2026-11-16 21:18–21:21 UTC, on the new
release. Photo Edit runs one request per requested output in parallel, so a
multi-image edit produced several events per click.

## 3. AutoClip clip save timed out (WEB-Z)

**What happened.** `prisma.clip.create()` failed inside the pick's final
transaction: *"Transaction API error: A rollback cannot be executed on an
expired transaction. The timeout for this transaction was 5000 ms, however
5989 ms passed."* (project `e094b9e7…`, 10 clips, 2026-11-16 22:32 and 22:39).

**Root cause.** The pick wrote clips with one `create()` per clip inside a
batch `$transaction`. Every row carries the clip's full transcript and signal
track, and each insert is a round trip Hostinger (Mumbai) → Supabase (Tokyo).
Ten of them exceeded Prisma's default 5 s transaction timeout. The job retried
and the run completed — but the retry re-downloaded the source and paid for
transcription and Gemini a second time.

**Fix.** `lib/autoclip-pipeline.ts`: all clips are written with one
`clip.createMany()` (a single multi-row INSERT) plus the project update, and
the transaction timeout is raised to 30 s for very large picks.

## 4. AutoClip "Gemini returned no valid clip segments" (WEB-10)

**What happened.** Project `04c778cf…` (a game trailer — mostly music, sparse
speech), 2026-11-17 07:45 UTC. Gemini 2.5 Flash answered 200, but nothing in
the answer survived validation (empty array or clips shorter than the minimum
length). The job retried and completed with 5 clips.

**Root causes.** (a) Gemini occasionally returns nothing usable on a sparse
transcript; (b) the retry happened at job level, so transcription was paid for
again; (c) every failed attempt was logged as an error even though the next
attempt succeeded.

**Fix.**
- `selectClips` asks Gemini once more, with the same transcript, when the
  first answer has no usable clips — no re-download or re-transcription.
- `lib/job-queue.ts` and `pickJob` log a failed attempt as a **warning** when
  it will be retried; only the final attempt (or a non-retryable failure) is
  an error. This also covers WEB-Z's attempt-1 event.
- `logger.warn` now serialises `Error` objects (they used to print as `{}`).

## 5. Redis "Stream isn't writeable" at boot (WEB-5, regressed)

**What happened.** 21 s after the new release started (2026-11-16 21:08:42
UTC), the proxy's maintenance-mode check (`proxy.ts → getMaintenanceModeCached
→ redis.get`) fell back to memory. The server's main Redis client had
connected at 21:08:30; the proxy bundle has its **own** instance of
`lib/redis.ts` and its own connection, whose first handshake did not finish
within `ready()`'s 6 s cap.

**Impact.** None. The fallback answers "not in maintenance" and the request
went through.

**Fix.** `lib/redis.ts`: before a client has *ever* connected, and within 30 s
of the module loading, a fallback is logged as a warning. If the client is
still not connected 30 s after load, one error is reported ("not connected
30s after start"). Fallbacks after the first connection are errors as before,
and the existing outage timer for connection errors is unchanged.

## 6. Not changed

- **CLIPIRO-WEB-T** (yt-dlp "unknown failure") — fixed by #442, which is in
  the deployed release; no events since 2026-11-16 18:11. Resolve in Sentry
  once a URL import has run cleanly on prod.

## After deploy — what to check

1. Gemini billing turned on → run one Gemini image generation and one Photo
   Edit; both should succeed. Before that, expect exactly one
   "quota exhausted" error per attempt and no WEB-V/-Y duplicates.
2. Run an AutoClip with 10+ clips: no transaction-timeout error, project goes
   straight to rendering on attempt 1.
3. On the next restart, no `redis` errors in Sentry (warnings only).
4. Resolve WEB-W, -V, -X, -Y, -Z, -10, -5 once the release is live
   (the commit carries `Fixes` lines for them).
