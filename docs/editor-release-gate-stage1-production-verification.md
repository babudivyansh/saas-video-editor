# Editor Release Gate Stage 1 — Production Verification

Companion to `docs/editor-release-gate-stage1-report.md`. That report covered
what was implemented and tested **locally**. This one records what was
verified **against production** (`clipiro.com`), under the standing rule that
local tests, mocked tests and "code complete" do not count — only real
production behaviour does.

---

## P0-2 Production Export Incident

### Scope of outage

Every manual-editor export fails in production. Not intermittent, not
content-specific: **100% failure rate** across every combination tested.

Additionally in scope, though not separately re-tested: because the failure is
in a filter the free-tier watermark **always** appends, every free-tier render
is affected regardless of whether the project contains any text at all.

### Reproduction matrix

All rows are real production renders on real assets, triggered through the
real API, not simulations.

| # | Case | Project / asset | Result |
|---|------|-----------------|--------|
| 1 | Full project (2 video clips, 1 text clip, watermark) | `31080d99…` | FAILED at 20%, `encoding_failed` |
| 2 | Text clip removed (video only) | `31080d99…`, asset `cmsrusgaj…` | FAILED, identical |
| 3 | Single 5s clip, no split | `31080d99…`, asset `cmsrusgaj…` | FAILED, identical |
| 4 | Completely different asset | asset `cmst52nvk…` ("Video-14434.mp4") | FAILED, identical |
| 5 | Re-run after `-threads 1` encoder fix deployed | `31080d99…` | FAILED, identical |

Cases 2–4 ruled out asset, content, duration, splitting and font-specific
explanations. Case 5 ruled out the encoder fix as the answer (see
"What I got wrong" below).

### What 20% means

From `lib/editor/render-job.ts`, the progress ladder is:

| Line | Progress | Stage |
|------|----------|-------|
| 89–90 | 5% | job dequeued, doc loaded |
| 96–108 | 5→20% | per-asset download + audio-stream probe loop |
| 111–133 | (no update) | text files, caption ASS, `buildFilterGraph()`, `maybeUseFilterScript()` |
| **135** | **=20% exactly** | set immediately **before** `runFFmpegWithProgress()` |
| 136–140 | 20→85% | driven by ffmpeg's own `time=` stderr markers |
| 143–150 | 90% / 100% | upload / complete |

So "stuck at exactly 20%" means: **all assets downloaded successfully, the
filtergraph was built successfully, ffmpeg was spawned, and it died before
emitting its first progress marker.** It is not a download failure, not a
filtergraph-construction failure, and not a timeout.

### Actual ffmpeg exit code

**Exit code 8.**

Note this is *not* the exit 187 the synthetic smoke test produced. The two are
different failures — see "What I got wrong".

### Actual stderr root cause

Captured by reproducing the real project's real render in-process on the
production host (`GET /api/admin/render-diagnostics/reproduce`):

```
[AVFilterGraph @ 0x…] No such filter: 'drawtext'
Failed to set value '<filtergraph>' for option 'filter_complex': Filter not found
Error parsing global options: Filter not found
FFmpeg exited 8
```

This occurs at **`-filter_complex` parse time — before any decoding or
encoding begins.** No output file is produced (`exists: false, size: 0`).

### Production / local environment differences

This is the crux: the bug cannot reproduce in development.

| | Local (dev) | Production |
|---|---|---|
| Platform | Windows x64 | Linux x64 |
| Node | — | v22.18.0 |
| ffmpeg version | **6.1.1** (`essentials_build-www.gyan.dev`) | **7.0.2-static** (johnvansickle) |
| Source | `ffmpeg-static@5.3.0`, release tag `b6.1.1` | **does not match the pinned tag** |
| `drawtext` filter | **present** | **absent** |
| `libx264` / `aac` | present | present |
| `subtitles` / libass | present | present |
| Filters available | — | 486 (drawtext is the *only* missing one the app needs) |
| Build flags | — | 40 flags incl. `--enable-libfreetype`, `--enable-fontconfig`, `--enable-libfribidi`, `--enable-libass`; **no `--enable-libharfbuzz`** |

`package.json` pins `ffmpeg-static@^5.3.0` (5.3.0 is the latest published
version, so the caret range is not a factor); the installed package declares
`binary-release-tag: b6.1.1`.

**`b6.1.1` names the ffmpeg-static release, not the ffmpeg version.** Its
`ffmpeg-linux-x64` asset is a johnvansickle **7.0.2** build. Verified directly
by downloading and decompressing that release asset:

| | Value |
|---|---|
| `b6.1.1` linux-x64, uncompressed | **79,826,272 bytes** |
| production binary | **79,826,272 bytes** |
| match | **byte-for-byte identical** |
| `drawtext` string present in binary | **no** |

So production is running **exactly** the binary this project pins. Nothing was
swapped, overridden or hand-patched — consistent with the repo containing no
`.npmrc` and no `FFMPEG_BIN` / `FFMPEG_BINARY_RELEASE` / `FFMPEG_BINARIES_URL`
reference anywhere, and with release tag `b7.0.2` not existing at all (404).

**This is therefore not a regression.** The editor's text rendering has never
worked on Linux with this dependency. It presents as a sudden total outage
only because the free-tier watermark makes every export emit `drawtext`.

### Root cause

1. **FFmpeg 7.0 made `libharfbuzz` a hard build dependency of the `drawtext`
   filter.** In a 7.x build configured with `libfreetype` but *without*
   `libharfbuzz`, `drawtext` is silently not compiled — the build succeeds and
   every other text-adjacent component (fontconfig, fribidi, libass) is still
   present. This matches the observed evidence exactly: `drawtext` is the sole
   missing filter out of 486.

2. **`ffmpeg-static@5.3.0` — the latest published version, and the one this
   project pins — ships exactly such a build for linux-x64.** The Windows
   asset for the same release is ffmpeg 6.1.1, which predates the harfbuzz
   requirement and *does* have `drawtext`.

The result is a platform split: the filter exists in development and does not
exist in production, from the same pinned dependency. No host-side action can
change this, and there is no newer `ffmpeg-static` release to upgrade to.

The editor's filtergraph emits `drawtext` in two places
(`lib/editor/filtergraph.ts`): once per text clip, and **unconditionally for
the free-tier watermark** (line ~430, applied as the last video node). Because
the watermark path is unconditional for free-tier users, every export emits
`drawtext`, so every export dies at filtergraph parse time.

That is why removing the text clip in reproduction case 2 changed nothing.

### What I got wrong (recorded deliberately)

The synthetic smoke test in `GET /api/admin/render-diagnostics` — a bare
`testsrc → libx264` encode using the app's real `encodeArgs("cpu")` — failed
on production with **exit 187** and:

```
[libx264 @ …] using cpu capabilities: … AVX512
[vost#0:0/libx264 @ …] Error while opening encoder …
```

That is a **real, separate, reproducible bug**: the production CPU advertises
AVX-512 via cpuid, and libx264's default multi-threaded slicing then fails to
open the encoder. Variant probes confirmed it empirically at the app's real
1080×1920 export size (default threading → exit 187; `-threads 1` → exit 0).

I incorrectly treated fixing it as fixing the outage. It was not: the real
render dies at exit 8 during argument parsing and never reaches the encoder.
A passing synthetic test is not evidence that the real pipeline works, because
the synthetic test never exercised `-filter_complex` at all.

The `-threads 1` fix is retained because it is genuinely required — once
`drawtext` is restored, the encoder *will* be reached, and would then hit the
AVX-512 failure.

### Fix

**Primary — not yet chosen; being decided by evidence.** An earlier revision
of this document recommended "restore the pinned binary on the host." **That
was wrong** and is recorded here rather than deleted: it rested on the
assumption that release tag `b6.1.1` meant ffmpeg 6.1.1. Production was
already running the pinned binary, so there was nothing to restore, and the
host-side work that recommendation prompted could not have helped.

Three candidate fixes, in ascending cost:

1. **Prefer a system ffmpeg** — if the host ships its own ffmpeg that has
   `drawtext`, preferring it in `resolveFfmpegBin()` is a few lines with no
   rendering changes and no visual change. A probe for this was added to
   `GET /api/admin/render-diagnostics` (`systemFfmpeg` section); its verdict
   decides whether this option is available at all.
2. **Ship a drawtext-capable binary** — postinstall download of a linux build
   compiled with harfbuzz (e.g. BtbN) instead of relying on ffmpeg-static's
   asset. Preserves exact rendering output; costs ~80MB and a build-time
   network dependency.
3. **Port text rendering to libass** — rewrite text clips and the watermark
   onto the `ass`/`subtitles` filters, both confirmed present in the
   production binary, reusing the existing `lib/editor/caption-ass.ts`
   generator. Permanently binary-agnostic; substantial rewrite with real
   visual-parity risk (fonts, positioning, shadows, background boxes).

**Retained (code, already merged):** `-threads 1` on the libx264 output, in
both render paths, for the separate AVX-512 encoder bug:

- `utils/ffmpeg-render.ts` — `encodeArgs("cpu")` (AutoClip pipeline)
- `lib/editor/filtergraph.ts` — the editor's own encoder args, which do **not**
  route through `encodeArgs()` (the two pipelines share infrastructure but not
  this code — a fact that caused the first fix attempt to miss entirely)

### Regression protection

| Test | Guards |
|---|---|
| `utils/ffmpeg-render.test.ts` | `encodeArgs("cpu")` emits `-threads 1` before `-c:v`; gpu/nvenc path untouched; real end-to-end encode at 1080×1920 still succeeds |
| `lib/editor/filtergraph.test.ts` | the editor's own arg array emits `-threads 1` before `-c:v` |
| `app/api/admin/render-diagnostics/route.test.ts` | `-filters` and `-version` parsing produce real results (caught a regex flaw that reported a filter literally named `=`); full untruncated subprocess output (caught a truncation bug that would have falsely reported libx264/aac missing) |

Additionally, `utils/test-effects.ts` — a pre-existing smoke test that runs
every effect and transition filter against the *actually installed* ffmpeg
binary — now also covers the two text filters:

| Check | Guards |
|---|---|
| `text-drawtext` | the filter behind every text clip **and** the unconditional free-tier watermark — the exact filter whose absence caused this outage |
| `text-subtitles` | libass caption burn-in (present in both builds, but the other text path the editor depends on) |

That script already existed and was already the right *kind* of guard — it ran
real filters against the real binary. It simply never covered `drawtext`, which
is precisely where the outage landed. Verified the new checks are not vacuous:
an intentionally nonexistent filter name makes the harness exit non-zero with
`No such filter`, so a missing `drawtext` genuinely fails the run.

**Gap that remains, stated plainly:** `utils/test-effects.ts` only validates
the binary on the machine where it runs. Running it locally or in CI does not
prove production is healthy — every local test passes against a 6.1.1 binary
that has `drawtext`, which is exactly why this outage reached users. Closing
this fully requires running it (or an equivalent capability preflight) against
the **production** binary as part of deploy. See "Follow-ups".

### Production verification

**Not yet performed.** Blocked on the host-side binary restore.

Verification plan, to be run against production once the binary is restored:

- **Case A** — single video clip, no text
- **Case B** — split clips
- **Case C** — video + text (exercises `drawtext` directly)
- **Case D** — video + captions (also blocked on P0-1 credential rotation)

Each case must show: `status=completed`, `failureReason=null`, a real S3 video
that returns 200 and plays with correct duration/aspect/audio, and exactly one
credit charged.

---

## P0-2 Runtime Capability Investigation

A single-purpose diagnostic deploy, existing only to answer one question with
certainty: **does the production Linux host already provide a viable system
ffmpeg with every capability Clipiro requires?** It is report-only and changes
no runtime behaviour — deliberately, so a diagnostic deploy cannot become an
unreviewed runtime migration.

### Confirmed root cause

`ffmpeg-static@5.3.0`'s Linux runtime lacks the `drawtext` capability.
FFmpeg 7.0 made `libharfbuzz` a hard build dependency of `drawtext`; the
Linux asset is a johnvansickle 7.0.2 build configured with `libfreetype` but
**not** `libharfbuzz`, so `drawtext` is silently not compiled while every
other text-adjacent component (fontconfig, fribidi, libass) remains present.

### Platform split

| | Windows (dev) | Linux (production) |
|---|---|---|
| ffmpeg version | 6.1.1 (`essentials_build-www.gyan.dev`) | 7.0.2-static (johnvansickle) |
| `drawtext` | **present** | **absent** |
| Source | same pinned `ffmpeg-static@5.3.0` | same pinned `ffmpeg-static@5.3.0` |

Same dependency, same lockfile, different capability. `b6.1.1` names the
ffmpeg-static *release*, not the ffmpeg version — verified by downloading and
decompressing that release asset: 79,826,272 bytes, byte-for-byte identical to
production's binary, with no `drawtext` string in it. Production is running
exactly what this project pins; nothing was swapped or overridden.

Treated as a **latent Linux runtime incompatibility**, not a recent
regression, until evidence says otherwise.

### Why video-only tests failed

Isolation testing removed the text clip and the export still failed
identically. That looked like it exonerated text rendering; it did not. The
free-tier watermark (`lib/editor/filtergraph.ts`, applied as the last video
node) injects `drawtext` **unconditionally**, so a project containing no
user-added text still emits `drawtext` and still fails on the free plan. This
is why the failure is universal rather than limited to projects using text.

### Required capabilities (traced, not assumed)

Taken from the real production render commands — `lib/editor/filtergraph.ts`
(editor) and `encodeArgs("cpu")` in `utils/ffmpeg-render.ts` (AutoClip):

- **Video encoder:** `libx264`
- **Audio encoder:** `aac`
- **Filters:** 33, including `drawtext`, `subtitles`, `overlay`, `scale`,
  `crop`, `xfade`, `amix`, `adelay`, `volume`, `fps`, `format`, `concat`

`subtitles` is probed independently of `drawtext` — the caption path depends
on ASS/libass and its presence must not be inferred from drawtext's.

### Bundled runtime capabilities

_Probe results pending deploy._

### System FFmpeg probe

Candidates searched deterministically plus PATH resolution:
`/usr/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, `/opt/ffmpeg/bin/ffmpeg`,
`/snap/bin/ffmpeg`, and bare `ffmpeg`. For each: resolved path, exists,
executable bit and permissions, version, build configuration flags, full
filter availability, and encoder availability.

Filter availability is read from `ffmpeg -filters` and is authoritative;
build flags (freetype / harfbuzz / libass / fontconfig) are recorded as
supporting evidence only — a build can enable libfreetype and still lack
`drawtext`, which is precisely this incident.

_Probe results pending deploy._

### Direct smoke tests

Run against a specific binary, using Clipiro's real encoder request, on
synthetic `lavfi` sources only — no user media is touched. Each output must
exit 0, exist, be non-empty, and validate as real playable media (via a
sibling `ffprobe` where one exists, otherwise `ffmpeg -i` parsing; the method
used is reported so a weaker check is never mistaken for a stronger one).

| Case | What it proves |
|---|---|
| **A — basic encode** | 1080×1920 encode with Clipiro's actual `encodeArgs("cpu")` |
| **B — drawtext** | renders "Clipiro Test" via `drawtext` — the capability P0-2 turns on |
| **C — audio** | encodes with Clipiro's actual `aac` request |
| **D — subtitles/libass** | burns in a minimal ASS file via `subtitles` |

Verified locally before deploy that all four pass against a capable binary and
all four correctly **fail** against a missing one — so a production result is
a real finding rather than a probe artefact.

_Production results pending deploy._

### Decision

_Pending deploy._ Will be exactly one of **VIABLE SYSTEM FFMPEG FOUND** or
**SYSTEM FFMPEG OPTION ELIMINATED**.

### Next fix

_Pending the decision above._ Not to be chosen before the probe returns.

### P0-2 status

**FAILED / OPEN.** A capability probe does not close the incident. No
successful production export has been observed.

---

### Final P0-2 status

**FAILED / OPEN.**

Root cause is proven with direct production evidence. The fix is identified
and the code-side portion is merged, but the primary fix is a host action that
has not yet been applied, and **no successful production export has been
observed.** P0-2 does not move off FAILED until Cases A–C pass in production.

### Follow-ups (out of scope for this incident, recorded not actioned)

1. **Preflight capability check** — verify `drawtext` (and other required
   filters) exist before accepting a render, failing fast with a clear message
   instead of charging a credit and dying at 20% with a generic error.
2. **Binary-agnostic text rendering** — text clips and the watermark could be
   rendered via libass (`subtitles`), which *is* present in both builds and
   for which the repo already has a generator (`lib/editor/caption-ass.ts`).
   This would make the pipeline immune to this entire class of failure.
3. **Run the capability smoke test against production** — wire
   `utils/test-effects.ts` (or the `/api/admin/render-diagnostics` filter
   probe) into the deploy so a binary missing a required filter fails the
   deploy instead of silently breaking every export. This is the single
   change that would have prevented this outage reaching users.
4. **Credit refund on failure** — `refundCredit()` exists and is called in the
   failure path; worth confirming it actually restored credits for the failed
   renders during this outage.
5. **Admin dashboard React error #31** — unrelated crash observed while
   working in `/admin`: a queue-status object (`{wait, active, completed,
   failed, delayed}`) is rendered directly as a React child.
