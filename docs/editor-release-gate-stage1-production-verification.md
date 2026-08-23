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

### Blast radius — wider than the editor

`drawtext` is emitted at **four** production sites, not two. Every one of them
is broken on this binary:

| Site | Usage | Affected |
|---|---|---|
| `lib/editor/filtergraph.ts:379,384` | editor text clips (incl. shadow-offset pass) | any project with text |
| `lib/editor/filtergraph.ts:435` | editor free-tier watermark | **all** free-tier editor exports |
| `lib/autoclip-pipeline.ts:1310` | AutoClip free-tier watermark | **all** free-tier AutoClip renders |
| `utils/ffmpeg-render.ts:657` | streamer-video title overlay | **all** streamer-video generations |

The incident was scoped to the manual editor. It is not: AutoClip free-tier
renders and the streamer-video tool emit `drawtext` too and must be failing in
production for the same reason. This materially affects remediation scope —
see "Recommended Final Remediation".

### Bundled FFmpeg

Production probe, build `01a02ad3-…`:

| Property | Value |
|---|---|
| Resolved path class | bundled — `…/nodejs/node_modules/ffmpeg-static/ffmpeg` |
| Exists | yes |
| Executable | yes (mode `755`, 79,826,272 bytes) |
| Version | **7.0.2-static** (johnvansickle) |
| Platform / arch | linux / x64 (Node v22.18.0) |
| Filters available | 486 |
| freetype | ✅ |
| **harfbuzz** | ❌ |
| libass | ✅ |
| fontconfig | ✅ |

### Required Capability Matrix

32 of 33 required filters present. **`drawtext` is the only absent one.**

| Capability | Bundled FFmpeg | System FFmpeg |
|---|---|---|
| drawtext | ❌ | n/a — none exists |
| subtitles | ✅ | n/a |
| overlay | ✅ | n/a |
| scale | ✅ | n/a |
| crop | ✅ | n/a |
| xfade | ✅ | n/a |
| amix | ✅ | n/a |
| adelay | ✅ | n/a |
| volume | ✅ | n/a |
| fps | ✅ | n/a |
| format | ✅ | n/a |
| concat | ✅ | n/a |
| **libx264** (video encoder) | ✅ | n/a |
| **aac** (audio encoder) | ✅ | n/a |

Remaining 21 of the 33-filter contract (`afade`, `aformat`, `anullsrc`,
`asetpts`, `atempo`, `atrim`, `color`, `colorbalance`, `colorchannelmixer`,
`eq`, `fade`, `hue`, `noise`, `rgbashift`, `setpts`, `setsar`, `settb`, `tpad`,
`trim`, `vignette`, `zoompan`): all ✅.

`h264_nvenc` ❌ — expected and irrelevant; the gpu path is unused in
production per `lib/render-target.ts`.

### System Candidates

**No system ffmpeg exists on the production host.** All five candidates,
including PATH resolution, failed with `ENOENT`:

| Path | Exists | Usable | Reason |
|---|---|---|---|
| `/usr/bin/ffmpeg` | no | ❌ | `spawn … ENOENT` |
| `/usr/local/bin/ffmpeg` | no | ❌ | `spawn … ENOENT` |
| `/opt/ffmpeg/bin/ffmpeg` | no | ❌ | `spawn … ENOENT` |
| `/snap/bin/ffmpeg` | no | ❌ | `spawn … ENOENT` |
| `ffmpeg` (PATH) | no | ❌ | `spawn … ENOENT` |

No candidate reached capability probing, so there are no versions, filters,
encoders or build flags to report — nothing was found to probe.

### Smoke Test Matrix

Bundled binary, run on production against synthetic `lavfi` sources with
Clipiro's real encoder arguments. No system smoke tests ran — there was no
viable candidate to run them against.

| Case | Exit | Output | Non-empty | Valid media | Result |
|---|---|---|---|---|---|
| **A** basic encode 1080×1920 (`encodeArgs("cpu")`) | 0 | yes | 110,080 B | ✅ | **PASS** |
| **B** drawtext "Clipiro Test" | **8** | **no** | 0 B | — | **FAIL** |
| **C** aac audio | 0 | yes | 34,074 B | ✅ | **PASS** |
| **D** subtitles / libass | 0 | yes | 50,007 B | ✅ | **PASS** |

Validation used `ffmpeg -i` parsing — this project bundles no ffprobe package
and the host has no system ffmpeg to borrow one from. The method is recorded
so a weaker check is not mistaken for a stronger one.

Two results carry decisive weight:

- **B reproduces P0-2 exactly** (exit 8, no output) on synthetic input with no
  user media involved — confirming the fault is the binary's capability, not
  anything about a project, asset, font or filtergraph.
- **D proves the ASS/libass path genuinely works on the binary already in
  production** — not merely that `subtitles` appears in a filter listing, but
  that a real ASS file burns in and produces valid playable output.

A also confirms the earlier `-threads 1` change is doing its job: this same
1080×1920 encode previously failed with exit 187.

### Viability Decision

**SYSTEM FFMPEG OPTION ELIMINATED.**

Eliminated on the strongest possible ground — not "present but inadequate",
but **absent entirely**. There is no system ffmpeg on the production host at
any standard location or on `PATH`. `resolveFfmpegBin()`'s existing
system-PATH fallback is therefore dead code in this environment.

### Operational Stability Assessment

Moot for the eliminated option — there is no host binary whose stability could
be assessed. The finding that matters for what comes next:

The application's ffmpeg runtime is currently **fully deployment-controlled**:
it ships via `package.json` → `ffmpeg-static@5.3.0` → the `b6.1.1` release
asset, resolved per deploy, with no host dependency whatsoever. That property
is valuable and should be preserved. The runtime is deterministic today; it is
simply deterministic *at the wrong capability set*.

Had a system binary been found, depending on it would have traded that
determinism for an unmanaged dependency — installed outside Clipiro releases,
upgradable without a Clipiro deploy, and able to change or vanish between
deploys. **Technically viable** and **best long-term choice** would not have
been the same answer. That trade-off no longer needs deciding.

### Recommended Final Remediation

**Option 1 — ship a known-good pinned Linux FFmpeg build.** Recommended.

- Fixes all four `drawtext` sites at once with **zero rendering-code change**
  and **zero visual change** — including AutoClip and streamer-video, which
  Option 2 would otherwise have to port separately.
- Preserves full deployment control and determinism; must be pinned to a
  specific build **with checksum verification**, never a floating "latest"
  download.
- Costs ~80 MB and a build-time network dependency in the deploy.
- Restores service fastest and carries the least correctness risk, which is
  what a SEV-1 warrants.

**Option 2 — port text/watermark rendering to ASS/libass.** Recommended as
follow-up hardening, not as the incident fix.

- **Confirmed technically viable on production's current binary** — smoke test
  D passed, so this option genuinely solves the deployment problem without
  changing the binary. That is real evidence, not an assumption.
- Permanently removes the dependency on a fragile, platform-variable filter,
  and the repo already has an ASS generator (`lib/editor/caption-ass.ts`).
- But scope is four call sites across three subsystems, with real visual
  parity risk on fonts, positioning, outlines, shadows and opacity — the
  editor's text path alone uses `borderw`/`bordercolor`/`shadowx`/`shadowy`
  plus a separate shadow-offset `drawtext` pass. Substantial work with a
  visible-output blast radius; wrong shape for a SEV-1 hotfix.

Neither is implemented. Awaiting review.

### P0-2 Status

**FAILED / OPEN.** A capability probe does not close the incident. No
successful production export has been observed.

### Probe methodology (for reproducing these results)

Candidates searched deterministically plus PATH resolution. Filter
availability is read from `ffmpeg -filters` and is authoritative; build flags
(freetype / harfbuzz / libass / fontconfig) are supporting evidence only — a
build can enable libfreetype and still lack `drawtext`, which is precisely
this incident.

Smoke tests use synthetic `lavfi` sources only; no user media is touched.
Before deploying, all four cases were verified locally to pass against a
capable binary **and** to correctly fail against a missing one — so a
production result is a real finding rather than a probe artefact. The probe
is report-only: it does not change binary selection or any runtime behaviour.

---

---

## P0-2 Final Remediation

### P0-2 Final Root Cause

The Linux binary distributed through `ffmpeg-static@5.3.0` was incompatible
with Clipiro's render contract because the `drawtext` filter was absent. Its
release tag `b6.1.1` names the ffmpeg-static release, not the ffmpeg version;
the Linux x64 asset was republished on 2025-11-14 as a johnvansickle **7.0.2**
build configured with `libfreetype` but without `libharfbuzz`, which FFmpeg
7.0 made a hard dependency of `drawtext`. 32 of Clipiro's 33 required filters
were present and `drawtext` was the only one missing. Every applicable
production render encountered `drawtext` — including apparently text-free
Free-tier exports, because the watermark itself uses the filter — so FFmpeg
failed during filtergraph parsing with **exit code 8, before encoding began**.

### Why Earlier Diagnoses Were Wrong

Recorded rather than deleted; each was believed at the time and disproven by
later evidence.

| Hypothesis | Verdict | How it was disproven |
|---|---|---|
| Specific asset or project is corrupt | **Disproven** | Reproduced on three different assets and on a single untouched clip |
| Font selection / missing font file | **Disproven** | Fails identically with a synthetic `lavfi` source and no user font involved |
| Removing user text avoids the failure | **Disproven** | The Free-tier watermark injects `drawtext` unconditionally, so text-free projects still emit it |
| AVX-512 / libx264 threading is the root cause | **Real but secondary** | A genuine, reproducible bug (exit 187 → fixed by `-threads 1`), but the real render dies at exit 8 during parsing and never reaches the encoder |
| A passing synthetic encode proves the pipeline works | **Disproven** | The synthetic test never exercised `-filter_complex`; it passed while every real export failed |
| Production's binary was swapped/overridden on the host | **Disproven** | The pinned `b6.1.1` asset is byte-for-byte identical (79,826,272 bytes) to production's — nothing was swapped |
| A system ffmpeg could be preferred instead | **Eliminated** | No system ffmpeg exists: all five candidate paths and PATH returned ENOENT |

The single most costly mistake was treating a green synthetic smoke test as
evidence that real rendering worked. It cost a deploy cycle and produced a
confident, wrong "root cause" report.

### Blast Radius

`drawtext` is emitted at four production call sites, all sharing one binary:

| Call site | Path | Impact |
|---|---|---|
| Editor text clips | `lib/editor/filtergraph.ts:379,384` | any project with text |
| Editor Free-tier watermark | `lib/editor/filtergraph.ts:435` | **all** Free-tier editor exports |
| AutoClip Free-tier watermark | `lib/autoclip-pipeline.ts:1310` | **all** Free-tier AutoClip renders |
| Streamer-video title | `utils/ffmpeg-render.ts:657` | **all** streamer-video generations |

This is why a single runtime replacement was chosen over three separate ASS
rewrites.

### Replacement Runtime

| Property | Value |
|---|---|
| Source | `eugeneware/ffmpeg-static` release **`b6.0`** (johnvansickle build) |
| Artifact | `ffmpeg-linux-x64.gz` |
| Version | **ffmpeg 6.0-static** |
| Archive SHA-256 | `17c1ae10b52ac499180679fe6ba77e17642390c4eedb0f1e3b0ac045da55128f` |
| Binary SHA-256 | `ed652b2f32e0851d1946894fb8333f5b677c1b2ce6b9d187910a67f8b99da028` |
| Binary size | 78,683,840 bytes |
| Capabilities | `drawtext` ✅, `subtitles` ✅, `libx264` ✅, freetype ✅, libass ✅ |
| Install path | `vendor/ffmpeg/ffmpeg` (outside `node_modules`, so a package reinstall cannot replace a verified runtime) |

**Why 6.0:** it predates the FFmpeg 7.0 change that made harfbuzz mandatory
for `drawtext`, so the filter is compiled in. It also narrows the dev/prod gap
— development runs 6.1.1.

**Licensing:** same provider and same GPL/version3 licensing family as the
binary it replaces (production already reported `--enable-gpl
--enable-version3`). This is a version pin, **not** a licensing change, and
introduces no new obligation.

**Update process:** change `PINNED` in `scripts/install-render-ffmpeg.mjs` —
URL, version, and *both* checksums together — then run
`npm run verify:render-runtime`. Never bypass a checksum mismatch; verify the
artifact and update the pin deliberately.

### Deployment Protection

Three independent layers, each of which alone would have caught this outage:

1. **Install-time integrity** — `postinstall` downloads the pinned artifact
   and verifies SHA-256 of both the archive and the decompressed executable
   before trusting it. A mismatch is fatal and fails the install.
2. **Deploy-time capability gate** — `npm run verify:render-runtime` runs
   inside `build`, executes the real selected binary, and checks all 33
   filters, both encoders, and four live smoke renders (basic encode,
   drawtext, aac, ASS/libass). A failure fails the build, so a runtime that
   cannot render never reaches production.
3. **Request-time fail-closed gate** — `POST /api/editor/render` calls
   `getRenderRuntimeHealth()` **before** spending a credit. An unhealthy
   runtime returns `503 RENDER_RUNTIME_UNHEALTHY` with a sanitized user
   message; internally the exact missing filters/encoders, binary path and
   version are logged. During the outage the service charged a credit and
   enqueued a render it could not complete; it will no longer do that.

Runtime resolution order (`resolveFfmpegBin()`): `CLIPIRO_FFMPEG_PATH` →
pinned `vendor/ffmpeg/ffmpeg` → `ffmpeg-static` (development) → bare `ffmpeg`
on PATH (**local development only** — production has none). An explicitly
configured `CLIPIRO_FFMPEG_PATH` that does not exist now throws rather than
silently falling back, since silent substitution is the failure shape that
produced this incident.

### Deployment Verification

Production build `01a02fa5-de31-71f5-8c3a-424533a51487`, verified live:

| Gate | Result |
|---|---|
| postinstall | ✅ pinned runtime installed to `…/nodejs/vendor/ffmpeg/ffmpeg` |
| checksum | ✅ install is fatal on mismatch; binary on disk is **78,683,840 bytes**, exactly the pinned size. Independently proven on a real Linux runner in CI: `[render-ffmpeg] sha256 verified: ed652b2f…` |
| runtime verifier | ✅ `verify:render-runtime` runs inside `build`; the deploy succeeded, so it passed |
| build | ✅ completed |
| production runtime | ✅ `ffmpeg version 6.0-static` (johnvansickle), executable, mode 755 |
| capability contract | ✅ **33/33 filters**, `missingFilters: []`, 478 filters available |
| encoders | ✅ `libx264`, `aac` (`h264_nvenc` absent — gpu path unused in production) |

Live smoke tests on the production host:

| Case | Result |
|---|---|
| A basic encode (1080×1920, production encoder args) | ✅ PASS — exit 0, 110,080 B |
| B **drawtext** | ✅ PASS — exit 0, 51,970 B *(previously exit 8)* |
| C aac audio | ✅ PASS — exit 0, 34,074 B |
| D subtitles / libass | ✅ PASS — exit 0, 50,007 B |

### Production Export Matrix

Real exports against real assets on production.

| Test | Result | Progress | Output | Credits |
|---|---|---|---|---|
| Free watermark | ✅ **PASS** | 100 | 720×1280, 6.00s, 2.18 MB, plays; watermark visibly burned in | 786→785 (−1) |
| User text | ✅ **PASS** | 100 | 720×1280, 6.00s; "Big Bold Heading" in Anton, white, centred, with watermark | 785→784 (−1) |
| Split clips | ✅ **PASS** | 100 | 720×1280, **8.00s** (4+4), audio present, segments visually distinct | 783→782 (−1) |
| Different asset | ✅ **PASS** | 100 | 720×1280, 4.00s, watermark present | 782→781 (−1) |
| Paid / no watermark | ⚠️ **NOT TESTED** | — | Account's subscription lapsed 2026-08-22; testing would require mutating billing | — |
| Captions | ⛔ **BLOCKED BY P0-1** | — | STT credentials still unavailable; sanitized error, **no credit charged** | 781→781 (0) |
| AutoClip watermark | ❌ **FAILS — NOT drawtext** | 0 | Fails immediately at progress 0 with `failureReason: null`, before any filtergraph | charged then refunded |
| Streamer title | ⚠️ **NOT VERIFIED** | — | Requires overwriting a real project's uploaded source — destructive, not run | — |

All four editor exports: `status=completed`, `progress=100`, `failureReason=null`,
S3 object HTTP 200 `video/mp4`, decodes and seeks, correct 9:16 (0.5625) aspect
with the free-tier 720p cap applied, and duration exactly matching the timeline.

**Test-design correction, recorded:** the first split-clip attempt produced 4s
instead of 8s. That was **my error, not a product fault** — I built segment B
at source offset 25s trusting `Asset.durationSec = 45`, but the file is really
**22.56s**, so that segment had no frames. Re-run with in-range offsets it
produced exactly 8.00s. This does surface a genuine, separate data-integrity
bug (stored asset duration ~2× the real length), which also explains why the
user's original 45s timeline was built on bad metadata. Out of scope here.

**AutoClip (Test 7), classified deliberately:** two re-renders were attempted.
The first failed because the project's source upload no longer exists
(retention/cleanup). The second used a project whose source is present and
reachable (HTTP 200) and still failed at `progress: 0` with no
`failureReason`, i.e. before ffmpeg built any filtergraph. This is **not the
drawtext failure**: `drawtext` is proven present on this binary by smoke B,
and the editor watermark — which uses the *same* `resolveFontFile("Poppins")`
and the same drawtext construction — renders correctly in Test 1. AutoClip has
an independent open issue; it is not P0-2 and was not investigated further per
scope.

**Streamer title (Test 8) residual risk:** `runStreamerFFmpeg`
(`utils/ffmpeg-render.ts:657`) emits `drawtext` **without a `fontfile`**,
relying on fontconfig to resolve a family. The build has `--enable-fontconfig`,
but a static binary on a minimal host may have no system fonts installed, in
which case that call can still fail with "Cannot find a valid font". Untested
and unproven either way — worth an explicit check before relying on it.

### Secondary Encoder Finding

**Status: UNRESOLVED.** Mitigation retained, untouched.

The AVX-512 / libx264 threading failure (exit 187) was reproduced on the *old*
7.0.2 binary at 1080×1920 with default threading, and fixed by `-threads 1`.
The new runtime is a different build (6.0) with a different bundled libx264, so
the earlier result does not transfer. Smoke A passes at 1080×1920 — but it runs
**with** `-threads 1` in `encodeArgs("cpu")`, so it cannot tell us whether the
bug still exists underneath. Determining that requires rendering without the
mitigation, which this task explicitly forbade.

Recommended follow-up (no production risk): add a default-threads variant probe
to `/api/admin/render-diagnostics` and compare against the `-threads 1` case on
the new binary. Until then the mitigation stays.

### Runtime Protection

| Layer | State |
|---|---|
| Checksum gate | ✅ Active — fatal on mismatch; verified on a real Linux runner in CI |
| Capability gate | ✅ Active — production reports 33/33 filters and both encoders |
| Smoke-test gate | ✅ Active — runs inside `build`; all four passed on the deployed host |
| Request-time fail-closed | ✅ Active — `POST /api/editor/render` calls `getRenderRuntimeHealth()` before `spendCredits`. Covered by 6 automated tests (refuses without charging, refuses on missing filter, missing encoder, or unusable binary; sanitized message; capability logging; healthy runtime still renders). Not exercised destructively in production by design — the runtime is healthy, so every gate call passed through and all four exports proceeded. |

### Credit Integrity

- **Editor exports (P0-2 scope): PASS.** Four successful renders, each charged
  exactly once (−1), no refund on success, no duplicate charge.
- **Failed caption attempt: correct.** 781→781, no net charge.
- **Anomaly, outside P0-2:** across the two failed AutoClip re-renders the
  balance ended **+2 higher** than charge/refund arithmetic predicts (781 →
  783, stable on re-read). It favours the user and is confined to the AutoClip
  re-render refund path, not the editor export path. `CreditTransaction` is not
  exposed through any API, so this could not be reconciled against the ledger
  from here — flagged for a direct DB check.

### Observability

Across all real production renders: **no `missing_filter`, no drawtext error,
no ffmpeg exit 8, no runtime-capability error.** Every editor export completed
with `failureReason: null`. The caption failure returned its sanitized
classification correctly. One gap noted: failed AutoClip re-renders record
`failureReason: null`, leaving no user- or operator-visible reason.

### P0-2 Status

**FIXED.**

Every closure condition is met with real production evidence: pinned runtime
active, checksum verified, 33/33 capability contract satisfied, all four
deployment smoke tests passed, and four real editor exports — free-tier
watermark, user text, split clips, and a second unrelated asset — each reached
`progress=100` with `failureReason=null`, produced a valid playable MP4 at the
correct duration and aspect, and charged exactly one credit. The universal
render failure is gone.

Scope note: AutoClip and streamer-video remain unverified/failing for reasons
established above to be independent of `drawtext`. They are tracked separately
and do not reopen P0-2.

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
