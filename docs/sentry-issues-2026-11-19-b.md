# Sentry issues — 2026-11-19 (after #453 / #454)

Every issue in `clipiro/clipiro-web` with activity on 2026-11-19 UTC.

**Every event is from release `c95c0e1f` (#452).** PRs #453 and #454 are
merged but have not reached production: the deploy of #453 failed on a Prisma
engine permission error (see `fix/prisma-engine-exec-guard`). So nothing those
two PRs fixed has been tested live yet. That covers the DB pool, the link
import, the crop overflow and the /tmp cleanup.

Branch: `fix/sentry-issues-2026-11-19-b`.

## Summary, by priority

| # | Priority | Issue | Where | Events | Root cause | Status |
|---|----------|-------|-------|--------|------------|--------|
| 1 | **P1** | CLIPIRO-WEB-14 (new cause, same title) | AutoClip render + re-render | ~25 | The uploaded source's AAC audio is partly corrupt; one bad frame decodes as 9–21 channels with no layout, ffmpeg can't downmix it and aborts the whole render | Fixed (audio rebuilt once and render retried) |
| 2 | **P1** | CLIPIRO-WEB-C, -1C, -1F, -1E | AutoClip pick + re-render: downloading the source | 1 + 6 + 6 + 1 | A 1.1 GB source download stalled on the host; after 5 idle minutes the job failed and its retry started from byte zero | Fixed (stalled downloads resume) |
| 3 | P2 | CLIPIRO-WEB-1G, -1H, -1J | Clip download / download-all | 7 + 1 + 1 | The host could not connect to S3 for a few minutes (connect timeout to all 7 S3 addresses); one failed clip failed the whole zip | Fixed (retry; skip one bad clip) |
| 4 | P2 | CLIPIRO-WEB-1D | Admin → Assets | 4 | Flagged assets were returned with `size` still a BigInt | Fixed |
| 5 | P3 | CLIPIRO-WEB-1B | Google sign-in callback | 1 | Token exchange refused (detail redacted); most likely `invalid_grant`, a one-time code used twice; the user got a raw JSON error page | Fixed (redirect + clear message; only real config errors page) |
| – | – | CLIPIRO-WEB-1A, -17, -16 | DB "max clients reached" | 2 + 3 + 1 | Same as WEB-9 | Already fixed in #453; **needs the deploy** |

All of 1–3 come from one project: an 81-minute 1080p60 upload (1.1 GB).

---

## 1. Corrupt source audio aborts every render (WEB-14, new cause)

**What happened.** The first render of all ~20 clips (03:12 UTC) and every
re-render after it failed with:
`[aac] channel element 2.1 is not allocated … Reserved bit set …
Rematrix is needed between 9 channels and stereo but there is not enough
information to do it … Error reinitializing filters! … Conversion failed!`
Each attempt used a fresh download, so the corruption is in the uploaded file,
not in a transfer. (Sentry groups these under WEB-14 because the title is just
"FFmpeg exited 1"; the crop overflow WEB-14 was opened for is a different
bug, fixed in #453.)

**Root cause.** Parts of the file's AAC stream are corrupt. ffmpeg drops most
bad packets, but one decodes as a frame claiming 9 (or 21) channels with no
channel layout. ffmpeg rebuilds the audio filter graph for it, the automatic
resampler can't downmix an unnamed 9-channel layout to stereo, and the whole
render aborts. ffmpeg 7+ can drop such a frame (`-drop_changed`); production
runs the pinned **ffmpeg 6.0**, which has no such option.

**Reproduced locally**: corrupting bytes in a stereo AAC stream until ffmpeg
6.1 produced `Rematrix is needed between 21 channels and stereo … Conversion
failed!`. That 15 KB, 40-frame sample is committed as
`lib/__fixtures__/corrupt-aac-channel-switch.aac`.

**Fix.** `lib/audio-safe-source.ts`. When a clip render fails with that
signature, the source's audio is rebuilt once through `pan` (which addresses
channels by index, so it accepts any channel count or none). The video stream
is copied, not re-encoded, and the clip renders again from that copy. All
clips rendering from the same source share one repair; the copy is deleted
with the source. Healthy sources never pay for it. Tested on real ffmpeg with
the fixture: the plain encode fails, the repaired one succeeds.

## 2. Source downloads stall and restart from zero (WEB-C, -1C, -1F, -1E)

**What happened.** The AutoClip pick for the 81-minute upload failed three
times in a row, each attempt ending in exactly
`Download timed out after 300000ms`, i.e. five minutes without receiving a
byte. Six re-renders later failed the same way; one got `read ETIMEDOUT`.

**Root cause.** Two parts:
- *On the host:* the server stopped receiving data from S3 for minutes at a
  time. The same window has S3 connect timeouts (issue 3). The account was
  near its disk quota and hitting its 20 MB/s I/O cap (see #454), while every
  render and re-render pulled the whole 1.1 GB source. This can't be fixed
  in code.
- *In our code:* `utils/download.ts` gave a stalled transfer one five-minute
  idle window, then failed. The job retry downloaded the whole file again from
  byte zero, and the third failure ended the run. A write error, such as a
  full disk, wasn't handled at all, so the socket simply paused until the
  timeout fired.

**Fix.** `downloadFile` now resumes. A stall (90 s with no data) or a dropped
connection after some bytes have arrived continues with an HTTP `Range`
request from what is already on disk, up to 4 times. A server that ignores
the range gets a clean rewrite from the start. A write error fails at once.
Tested against a real local server: a stall mid-body, a dropped connection, a
server that ignores Range, and a server that never answers.

## 3. S3 unreachable for clip downloads (WEB-1G, -1H, -1J)

**What happened.** `TypeError: fetch failed` caused by
`ConnectTimeoutError … attempted addresses: 3.5.209.195:443, … (7 addresses),
timeout: 10000ms` on download and download-all, 04:01–04:04 UTC.

**Root cause.** The host couldn't open connections to S3 for a few minutes
(the same window as issue 2). In download-all, the clip loop had no
per-clip error handling, so one clip's failure threw out of the loop and
failed the whole archive. The single download didn't retry.

**Fix.** Download-all retries each clip once and skips a clip it still can't
get (the `X-Clips-Included` header already tells the client). The single
download retries once and answers 502 "Could not reach storage" instead of
500.

## 4. Admin Assets crashes on BigInt (WEB-1D)

**Root cause.** `Asset.size` became a BigInt in #303. `/api/admin/assets`
converted the totals, but spread each flagged asset row into the response
with `size` unconverted, so `Response.json` threw as soon as one asset was
flagged. **Fix:** `size: toByteCount(f.size)`, plus a test. The other routes
that select `size` already convert it.

## 5. Google sign-in token exchange (WEB-1B)

**What happened.** One `Token exchange failed` on Android Chrome. The details
Google returned were redacted by Sentry.

**Root cause.** Google sign-in works for everyone else, so this isn't a
configuration problem. A one-off failure is almost always `invalid_grant`:
the one-time code had already been used or had expired (the callback loaded
twice, or a mobile browser restored the tab). The user then saw a raw JSON
error page.

**Fix.** `invalid_grant` → warning plus redirect to
`/login?error=oauth_expired` ("sign in with Google again"). Any other reason
→ error naming the reason (so Sentry shows it even when the payload is
redacted) plus redirect to `/login?error=oauth_failed`. The login page now
also explains `rate_limited`, which it previously ignored.

---

## After deploy

- **Get the #453 deploy through** (Prisma engine permissions). Until then
  production still has the DB pool, link import, crop and /tmp bugs.
- Resolve WEB-14, -C, -1C, -1F, -1E, -1G, -1H, -1J, -1D, -1B (and -1A, -17,
  -16 with #453).
- Not done here: a re-render still downloads the whole source to render one
  clip. Reading only the clip's window from S3 would cut a 1.1 GB transfer to
  a few MB.
