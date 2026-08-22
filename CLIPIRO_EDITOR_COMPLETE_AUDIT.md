# Clipiro Video Editor — Independent Complete Audit

**Scope:** the manual multi-track editor at `/dashboard/editor` on `main`/production (`clipiro.com`), plus the unmerged branch `feat/editor-autoclip-parity` (commit `5642c72`, 2026-08-20, no PR) which is audited separately and labeled throughout — it is not deployed and a paying user cannot reach it today. Where a finding applies to the sibling **AutoClip** pipeline (which shares credits/render-queue/S3 infrastructure with the editor and owns almost all of the "AI-first" capability this brief asks about), it is labeled `[AutoClip]` and cross-referenced to two existing prior audits (`docs/autoclip-audit-2026-08.md`, `docs/autoclip-e2e-report-2026-08.md`) rather than re-derived from scratch.

**Method:** three parallel research passes mapped the full frontend/backend/security architecture with file:line citations; a fourth independently re-verified every claim in the parity branch's own self-report inside an isolated git worktree (re-running `tsc`/`eslint`/`vitest`/`build`, not trusting its commit message); two more closed remaining research gaps (timeline precision, audio, transitions, animation parity, accessibility, scale limits, DB design, code quality, test coverage). Finally, live browser verification was performed directly against production with a real authenticated session on the project you specified, including **real** Export and **real** auto-caption generation (both pre-authorized, both cost recovered/refunded on failure). Every finding below is evidence-based: either a file:line citation or a reproduced browser step. Two significant findings were live-confirmed as *currently, actively broken in production* during this audit, not merely inferred from code.

---

## 1. Executive Verdict

**NOT READY.**

Two of the editor's most basic promises are broken in production right now, confirmed by directly exercising them during this audit, not inferred:

- **Export fails.** Triggered twice on a real project; both times the render failed at ~20% progress, the credit was correctly refunded, but no reason was recorded anywhere — the `Project.failureReason` column the schema provides for exactly this is `null`. Neither the user nor this audit could determine why without server-side log access.
- **Auto-captions fail.** The editor's only genuinely-implemented AI feature returns a raw ElevenLabs `invalid_api_key_id_used_as_api_key` error verbatim to the user. This is the identical issue a prior audit (`docs/autoclip-e2e-report-2026-08.md`) flagged 14 days ago as "the single highest value-per-effort action available" to fix. It has not been fixed. Live evidence from this account's own AutoClip project history (checked today, 2026-08-22, at zero additional cost) shows the same outage: 8 of 13 projects failed, and the one that succeeded carries a live banner reading *"Speaker tracking couldn't run on our side... This affects every video until it's fixed."* This is a systemic, ongoing, multi-week production outage affecting both pipelines, not a one-off glitch.

Beyond those two live blockers, autosave has zero optimistic-concurrency protection (confirmed last-write-wins, corroborated independently three separate ways), the export endpoint has a real double-submit race, and an unmerged branch about to add real editor capability contains an empirically-reproduced data-corruption bug in caption regrouping.

Set against this: the core hand-editing experience — load, play, scrub, select, trim, split, move, delete, undo, redo, add text, add asset, switch aspect ratio, autosave, refresh-and-persist — all worked correctly when live-tested. Tenant isolation and injection defenses are unusually mature for a codebase this size. Code quality inside the editor is genuinely clean (zero `any`, zero stray `console.*`, one real TODO). The foundation is sound; the two pipelines sitting on top of it are currently failing in ways that would visibly break the product for a paying user today.

---

## 2. Executive Scorecard

| Area | Score |
| --- | --: |
| Overall UX | 6 |
| UI hierarchy | 7 |
| Timeline | 6 |
| Preview/canvas | 6 |
| Captions | 5 |
| Audio | 3 |
| AI editing | 2 |
| Assets | 8 |
| Autosave | 5 |
| Undo/redo | 7 |
| Export | 2 |
| Performance | 5 |
| Responsiveness | 6 |
| Accessibility | 4 |
| Security | 8 |
| Tenant isolation | 9 |
| Billing integrity | 8 |
| Error recovery | 3 |
| Code architecture | 7 |
| Test coverage | 5 |
| **Production readiness** | **2** |

---

## 3. Architecture Map

```
UI (Zustand store, app/dashboard/editor/store/editorStore.ts)
  → autosave PATCH /api/projects/[id]  (1.5s debounce, whole-doc rewrite)
    → Postgres: Project.editorDoc (ONE JSON blob, capped 1MB, no updatedAt/version column)
  → Export: POST /api/editor/render
    → ownership + asset re-resolution + Redis fast-fail credit check + atomic spendCredits()
    → renderQueue.enqueue()  [lib/render-queue.ts — production runs the in-process driver, not BullMQ]
    → lib/editor/render-job.ts: serial asset download → buildFilterGraph() → spawn(ffmpeg, argv[])
    → S3 upload → Project.status/progress/videoUrl updated → client polls GET /api/projects/[id] every 3s
```

**Two separate pipelines share this infrastructure but not code.** The manual editor (`app/dashboard/editor/`, `lib/editor/*`, `Project.editorDoc`) is a from-scratch, single-JSON-document, Zustand-driven system. **AutoClip** (`lib/autoclip-pipeline.ts`, the relational `Clip` table) is a separate, much larger pipeline that owns nearly every AI-editing capability this brief asks about — silence/filler removal, smart reframe/speaker-tracking, auto-zoom, dubbing, B-roll, translation. They meet only at: credits (`lib/credits.ts`), the render queue, S3, and a one-way hand-off (`edit-in-editor/route.ts`) that lets a user move an AutoClip result into the manual editor. **The manual editor's only overlap with AutoClip's AI capability is auto-captions** (shared transcription chain: ElevenLabs Scribe → OpenAI Whisper → fal Whisper, `lib/transcription.ts`).

State/schema is dependency-free and shared client+server (`lib/editor/types.ts`), which is a notably solid pattern — the same `validateDoc()`/`TimelineDoc` types drive both the client store and the server render job, preventing client/server schema drift. FFmpeg is invoked exclusively via `spawn()`/`subprocess.run()` with argv arrays across the entire codebase (verified by a zero-match grep for `shell: true`/`exec(`/`execSync(`) — no command-injection surface exists.

---

## 4. Editor Feature Inventory

| Feature | UI | Backend | End-to-End | Browser Verified | Status |
| --- | --- | --- | --- | --- | --- |
| Load project by `?projectId=` | ✅ | ✅ | ✅ | ✅ | Production Ready |
| Deep link while unauthenticated → return after login | ✅ (partial) | ❌ | ❌ | ✅ (confirmed broken) | **Broken** |
| Playback (rAF compositor) | ✅ | — | ✅ | ✅ | Production Ready |
| Scrub / seek | ✅ | — | ✅ | ✅ | Production Ready |
| Select / trim / split / move / delete clip | ✅ | — | ✅ | ✅ | Production Ready |
| Undo / redo | ✅ | — | ✅ | ✅ (incl. redo) | Production Ready |
| Add asset from library | ✅ | ✅ | ✅ | ✅ | Production Ready |
| Add text (Lexical rich text) | ✅ | — | ✅ | ✅ | Production Ready |
| Text AI tools (rewrite/shorten/translate/etc.) | ✅ | ❌ | ❌ | ✅ (confirmed disabled) | UI Only |
| Caption AI tools (grammar/filler/translate/etc.) | ✅ | ❌ | ❌ | not clicked (same pattern) | UI Only |
| Auto-caption generation | ✅ | ✅ | ⚠️ | ✅ (confirmed **currently failing**) | **Broken (live)** |
| Caption karaoke/word/phrase highlight export | ✅ | ✅ | ✅ | not export-verified (export itself is broken) | Functional (code) |
| Aspect ratio switch (9:16/1:1/16:9) | ✅ | ✅ | ✅ | ✅ | Production Ready |
| Effects/Transitions | ✅ (mislabeled in one panel) | ✅ | ✅ | not export-verified | Functional (code), doc bug |
| Autosave + status indicator | ✅ | ✅ | ✅ | ✅ | Functional, no concurrency safety |
| Refresh → state persists | ✅ | ✅ | ✅ | ✅ | Production Ready |
| Export / render | ✅ | ✅ | ❌ | ✅ (confirmed **currently failing**, 2x) | **Broken (live)** |
| Silence removal | ❌ | ✅ (AutoClip only) | — | — | Missing (from editor) |
| Filler-word removal | ❌ (1 disabled button) | ✅ (AutoClip only) | — | — | Missing (from editor) |
| Smart reframe / speaker tracking | ❌ | ✅ (AutoClip only) | ⚠️ | ✅ live-checked (**"affects every video"**) | **Broken (live)**, AutoClip |
| Auto-zoom | ❌ (static preset only) | ✅ (AutoClip only) | ⚠️ | code-verified: compounds past ceiling | Partial, AutoClip |
| Dubbing / voice cloning / TTS | ❌ | ✅ (AutoClip only) | — | — | Missing (from editor) |
| Noise removal / vocal remover | ❌ (standalone tool) | ✅ | ✅ (unlinked) | not tested | Functional, not surfaced |
| Background music | ❌ (AI-generated) / ✅ (stock search) | ✅ (Jamendo) | ✅ | not tested | Functional (selection, not generation) |
| Audio ducking | ❌ (manual editor) | ✅ (AutoClip only) | — | — | Missing (from editor) |
| Waveform display | ❌ | ❌ | ❌ | ✅ (confirmed absent in UI) | Missing entirely |
| Audio mute/fade | ❌ | ❌ (not in schema) | ❌ | — | Missing entirely |
| AI assistant / chat editor control | ❌ | ❌ | ❌ | — | Missing entirely |
| Video crop/reframe (manual) | parity branch only | parity branch only | ⚠️ (bug found) | not browser-verified (unmerged) | Partial — parity branch |
| Background modes (blur/black/color) | parity branch only | parity branch only | ⚠️ (bug found) | not browser-verified (unmerged) | Partial — parity branch |
| Transcript panel | parity branch only | parity branch only | ⚠️ (bug found) | not browser-verified (unmerged) | Partial — parity branch |
| Brand panel | parity branch only | parity branch only | ✅ | not browser-verified (unmerged) | Functional — parity branch |
| Caption line-grouping | parity branch only | parity branch only | ❌ (data-corruption bug) | not browser-verified (unmerged) | **Broken** — parity branch |

---

## 5. Browser Verification Results

Performed against `https://clipiro.com/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3` with a real authenticated session, real project, real credits.

1. **Deep link while logged out** — navigating directly to the URL redirected to the public marketing page `/tools/video-editor` with `?projectId=...` silently stripped. **Confirms code finding #4 (P0).**
2. **Login → project load** — after sign-in, re-navigating to the same URL loaded the correct project (empty, "Untitled project", 11-tab sidebar matching current `main` — confirms the parity branch's Transcript/Background/Brand panels are correctly absent from production).
3. **Add asset** — clicked an existing library asset ("The ONE Thing Experts WON'T Tell You," 45s); it was added to the video track at the correct position, save status transitioned Saved → Saving → Saved.
4. **Play/scrub** — playback advanced correctly with live frame updates; clicking the ruler at ~8s jumped the playhead and preview correctly, timestamp synced.
5. **Split (`S` key)** — split cleanly at the playhead; properties panel showed correct Start/Duration/Trim-in on the resulting right segment.
6. **Undo/redo (`Ctrl+Z`/`Ctrl+Y`)** — both correctly reverted/reapplied the split; selection is (correctly, per architecture) not restored by undo/redo, only doc state.
7. **Delete + undo** — deleting the second segment correctly shortened the timeline; undo correctly restored it.
8. **Move (drag)** — dragging a clip created a real, correctly-rendered gap (black in preview); undo restored contiguity.
9. **Trim (drag handle)** — dragging the right trim handle correctly shortened Duration while leaving Start/Trim-in unchanged.
10. **Add text** — "Heading" preset added a real, immediately-editable Lexical text overlay on canvas and in the Text track; the properties panel exposed the full Basic/Adjust/Transform/Animation/AI tabs found in code.
11. **AI Tools stub** — expanding the Text panel's "AI Tools" section showed Rewrite/Shorten/Expand/Translate in muted/disabled styling, confirming the code-level UI-only-stub finding live.
12. **Aspect ratio switch** — 9:16 → 16:9 correctly reshaped the canvas.
13. **Generate captions (real, 1 credit)** — **failed.** UI displayed the raw ElevenLabs error verbatim: `ElevenLabs STT error 400: {"detail":{"type":"authentication_error","code":"invalid_api_key_id_used_as_api_key"...}}`. See §12, §22.
14. **Export (real, 1 credit)** — **failed, twice, reproducibly.** "Render failed — your credit was refunded." Direct API check (`GET /api/projects/[id]`) showed `status:"failed"`, `progress:20`, **`failureReason:null`**, `warnings:null` — the failure reason is not recorded anywhere accessible. Refund mechanism itself worked correctly both times (balance unaffected).
15. **Refresh → persistence** — full reload correctly restored both the split clips and the text overlay; save status showed "Saved."
16. **Responsive/window-resize testing** — attempted at 390×844; the automation environment's `resize_window` call did not actually change the page's viewport (`window.innerWidth` stayed 1920 regardless), so live breakpoint testing was not achievable here. Responsive behavior is verified from code only (§17) — an honest gap, not a claim of live verification.
17. **Zero-cost AutoClip account check** (not part of the pre-authorized editor-only spend, purely observational) — this account's AutoClip project history: **8 of 13 projects Failed, 1 Completed, 4 In progress.** The one completed project carries two live warning banners dated today: transcription failed (generic placeholders, no burned-in subtitles) and *"Speaker tracking couldn't run on our side... This affects every video until it's fixed."*
18. **Console errors** — none captured during the verified interactions (the export/caption failures were handled gracefully client-side, no uncaught exceptions).

---

## 6. UI/UX Audit

Layout is clean and matches the intended "premium, minimal, AI-first" direction: chromeless full-bleed route, 11-tab left sidebar (Media/Image/Video/Audio/Text/Caption/Sticker/Effect/Filter/Transition/Keys), center canvas, right contextual properties panel, bottom timeline. A first-time user can reasonably infer what to do — the empty-canvas state explicitly says "Add a video from the Media panel to start editing." Two header controls are dead weight: the Notifications bell has no `onClick` at all (silently inert, no visual disabled state), and the `⌘K` chip is an explicitly-commented phase-2 stub with no command palette behind it — both should either be wired or removed before launch, not left as clickable-looking dead buttons. Save-status pill, credit-cost previews on Export and Caption generation, and the export modal's honest "preview and export are closely matched, though text rendering may differ by a pixel or two" copy are all good, trust-building UX patterns already in place. The editor runs its own separate, genuinely dark theme (`editor-theme.css`) — worth noting because the project's own AGENTS.md documentation claims "no dark mode" for the design system, which is incorrect for this specific route.

---

## 7. Timeline Audit

Real multi-track support (video/text/audio/image + a parallel caption track), real drag/trim/split/move/delete/duplicate, real snap-to-edge (`lib/editor/doc-utils.ts`, snaps to other clip edges and the playhead, not a frame grid), real zoom (10–300px/sec). Time is pure float seconds throughout; `TimelineDoc.fps: 30` is **fully decorative** — never read anywhere in the export path (confirmed by exhaustive grep); every ffmpeg fps reference is an independently hardcoded `30` literal. Boundary conditions are well-guarded: split/trim both clamp to a `MIN_CLIP_DURATION = 0.05s` floor client-side, and `validateDoc()` independently re-checks for track overlap server-side with a 0.001s tolerance — overlap is prevented both by construction and by validation.

**Real performance cliff, code-confirmed:** `TimelineTrack.tsx` (used for video/image/text/audio) renders every clip unconditionally with no scroll/viewport windowing — architecturally incapable of windowing since scroll state isn't even plumbed to it. Only the caption track (`CaptionTrack.tsx`) windows by visible range. Worst case is `MAX_CLIPS_PER_TRACK = 50` unvirtualized, absolutely-positioned DOM nodes per track × 4 tracks, plus per-clip filmstrip thumbnail generation that multiplies with zoom level. The `snapEnabled` toggle exists in the store with zero UI control anywhere — snapping is permanently forced on; this is dead code from a user-facing standpoint.

---

## 8. Preview & Canvas Audit

DOM/CSS compositor (HTML5 `<video>`/`<img>` + absolutely-positioned overlays), not Canvas/WebGL, driven by an independent rAF master clock (`usePlayback.ts`) rather than any `<video>` element's own clock — a deliberate, sound architecture that keeps multi-element sync frame-accurate. Overlay position is drag-driven and writes normalized `x`/`y` directly back into the doc, "keeping preview and export placement identical" per the code's own header comment — and this claim held up under review. No on-canvas resize/rotate handles exist for any base clip type on `main` (numeric sliders only); `ImageClip` has no rotation field in the schema at all. No safe-area visual guides are rendered (the concept exists only as internal math for caption position presets).

**Resolved documentation bug (P1):** `VideoClipProps.tsx`'s Effects tab tells users Effect/Transition selections are "Preview only — not yet applied to exports." This is false, confirmed against `lib/editor/filtergraph.ts`, which genuinely consumes both `EFFECT_PRESETS[...].ffmpeg` and `TRANSITION_PRESETS[...].xfade` at render time — the same fields, correctly described, are edited from two other panels (`EffectPanel.tsx`, `TransitionPanel.tsx`). This actively teaches users to avoid a working feature.

**Parity branch only:** the new `VideoClip.crop` (pan/zoom reframe) is well-implemented — CSS and ffmpeg math verified algebraically equivalent, edge cases (scale clamp, x/y at 0/1) correctly handled. But when combined with the new background-fill feature, a real preview/export mismatch was found: the export code explicitly skips crop when background is active and its own comment claims the preview has the same limitation — it does not. The preview never checks `doc.background` before applying `crop`, so a user with both active sees the pan/zoom live but gets it silently dropped at export, with no test covering the combination.

---

## 9. Captions Audit

Architecture is genuinely strong when it can run: real word-level timestamps flow from the shared transcription chain into `CaptionClip.words[]`, a virtualized (scroll-windowed) caption list handles up to `MAX_CAPTION_CLIPS_PER_TRACK = 1000` cues, and karaoke/word/phrase highlight modes are real — confirmed exported via ASS `\k`/`\kf` override tags (`lib/editor/caption-ass.ts`), the same mechanism proven in production by the AutoClip pipeline. 16 style templates are shared with AutoClip's own caption styling, not a second invented system.

**But it is currently non-functional in production** — see §12/§22 for the live-confirmed ElevenLabs credential failure.

**Three real, previously-undisclosed UI/export mismatches found by direct code comparison against `caption-ass.ts`** (P1):
- `shadow.color` and `shadow.opacity` are silently dropped at export (only offset is used, averaged into one ASS `\shad` distance value) — the UI shows no disclosure and a `types.ts` comment incorrectly claims the whole field is "exported for real."
- `lineHeight` is silently dropped at export (zero references in `caption-ass.ts`) — sits undisclosed right next to the genuinely-real Opacity slider.
- `highlightMode` is the inverse problem: it is real and load-bearing at export (it decides `\k` vs `\kf` vs plain text) but is incorrectly badged `PreviewOnlyBadge` in the properties panel, understating a feature that actually works.

**Parity branch only, most severe finding of this pass:** the new caption "Lines" word-regrouping feature can silently corrupt a saved document. It pools words from *all* word-bearing cues across the whole track and re-chunks by fixed word count, ignoring manually-typed cues that sit between them in time. This was **empirically reproduced**: a manual cue at 10s, with AI-generated word bursts at 0s and 20s, regrouped under "three-lines" mode collapses into one 0–21.4s cue that swallows the manual cue — `validateDoc()` then rejects the document as having overlapping cues. Critically, autosave's `PATCH` handler never calls `validateDoc()` (only the export endpoint does), so the corrupted document **saves successfully and silently**, only surfacing later as a cryptic `"caption clips overlap or are unsorted"` 400 at export time, with the project now stuck.

---

## 10. Audio Audit

Thin relative to video/text. Volume and trim work end-to-end and are genuinely applied at render (`filtergraph.ts` volume/`adelay`/`amix`). But `AudioClip` has **no mute or fade fields in the schema at all** (unlike `VideoClip`/`ImageClip`, which both have them) — a real feature gap, not a missing-UI issue. **No waveform rendering exists anywhere** in the timeline or audio panel (confirmed by exhaustive grep). Ducking (`lib/audio-ducking.ts`) is fully built and genuinely used by AutoClip's render path but is **not wired into the manual editor's `filtergraph.ts` at all**. No automatic loudness normalization runs in either pipeline's render path — LUFS-style normalization exists in the codebase (`loudnorm=I=-23:TP=-2:LRA=7`) but only as a disconnected standalone tool. Three real, working audio-AI features exist (noise removal via ElevenLabs audio-isolation, vocal separation via fal.ai Demucs, LUFS loudness balancing) but none are linked or discoverable from inside `/dashboard/editor` — confirmed by grep, zero references.

---

## 11. Assets Audit

Well-built and shared correctly across the whole app, not editor-specific — live-confirmed (existing assets from other features appeared directly in the editor's Media panel). A module-level cache with pub-sub notification means an asset imported in one panel is immediately visible everywhere else, a deliberate fix for a previously-disclosed "stale until reload" bug. Upload validates MIME type server-side, deduplicates by checksum, enforces tier/storage quota via a real `HeadObjectCommand` re-check after multipart completion (never trusting client-declared size), and stamps provenance (`sourceFeature`/`sourceProjectId`). Signed URLs default to 6h and are re-minted server-side at render time — the editor never trusts a stored URL. Stock content (Pexels image/video, Jamendo audio, Giphy stickers) re-hosts as a normal owned asset on import, joining the same cache. No gaps found in this area.

---

## 12. AI Editing Audit

**This is the weakest area of the product and the source of both live P0s.** Inside the editor itself, exactly one AI feature is genuinely implemented end-to-end: auto-caption generation, complete with a real credit-cost preview and 402-aware error handling — and it is **currently broken in production**, returning a raw ElevenLabs `invalid_api_key_id_used_as_api_key` error to users verbatim. Three consistently-styled "AI Tools (Coming Soon)" stub sections exist (caption panel, text panel, per-clip text properties) with all buttons disabled — an honest, undisguised UI-only state, at least. Silence removal, filler-word removal, smart reframe/auto-crop, auto-zoom, AI-generated background music, dubbing, B-roll generation, and any AI assistant/chat capability are **confirmed entirely absent from the editor UI** — not stubbed, not present in any form. All of that capability exists only in the separate AutoClip pipeline, and a user inside `/dashboard/editor` has no discoverable path to it (the app's standalone AI tool pages under `/dashboard/tools/*` are similarly unlinked from the editor). The audit brief's phases 15–21 largely presuppose these capabilities live inside the editor; they do not, and the editor's roadmap should be read with that correction in mind.

On the AutoClip side specifically (live-checked today, not merely historical): the account's own project history shows an active, ongoing outage — 8 of 13 projects failed, and speaker-tracking/smart-reframe is confirmed non-functional "for every video" via a live warning banner, matching a documented AWS Rekognition IAM permissions gap that a prior audit flagged 14 days ago and that has evidently not been fixed. AutoClip's auto-zoom, separately, has a genuine architecture bug: two independently-built zoom systems (a word-heuristic system in `reframe.ts` and an energy-reactive spring in `camera-motion.ts`) both mutate the same crop keyframes multiplicatively, so effective zoom can compound to roughly 1.6× — well past either system's own stated 1.3× quality ceiling, with no combined-ceiling guard.

---

## 13. Autosave & Persistence Audit

Mechanically sound and live-confirmed working: 1.5s debounce, correct Saved/Saving/Failed status pill, export explicitly blocks until `saveState === "saved"` so the server always renders exactly what's persisted, and a full page refresh correctly restored every edit made during this audit's testing. Enforcement is sensibly two-tier: a cheap size/shape check (413 on the 1MB cap) on every `PATCH`, full `validateDoc()` deferred to export time.

**The one serious gap: zero optimistic-concurrency protection.** `Project` has no `updatedAt` or version column at all, and the autosave `PATCH` is an unconditional `prisma.project.update()`. Two open tabs, or a slow in-flight save racing a newer one, silently last-write-wins with no detection whatsoever. This was independently corroborated three separate ways during this audit: two separate research passes found it from opposite ends of the codebase, and an existing (uncommitted) implementation report on the parity branch had already flagged it as a known, deferred gap. `useAutosave.ts` also discards the server's actual error message on failure (e.g., hitting the 1MB cap), showing only a generic "Save failed" pill with no indication of cause or remedy.

---

## 14. Undo/Redo Audit

Well-engineered, hand-rolled snapshot stack (`structuredClone`, capped at 50 steps), live-confirmed correct including redo. Drag gestures are deliberately coalesced into a single undo step (snapshot on pointer-down, commit on pointer-up) rather than one per frame — verified both in code and live. `updateClip`'s explicit `undoable` flag correctly excludes per-keystroke text edits from the history. The one architectural nuance worth documenting: there are **two independent undo systems** — the app-level Zustand history and Lexical's own `HistoryPlugin` for in-progress text editing — kept coherent only by a focus-guard in the keyboard-shortcut hook (global `Ctrl+Z` is skipped while any input/contentEditable has focus), not by a unified design. Every history step is a full deep-cloned `TimelineDoc`, which is not memory-optimal for very large documents but is unlikely to matter given the 1MB/50-clip caps.

---

## 15. Export Pipeline Audit

Full chain: `ExportModal` → `POST /api/editor/render` (ownership check, asset re-resolution and re-ownership-check, `validateDoc`, Redis fast-fail credit check, atomic `spendCredits()`) → `renderQueue.enqueue()` → `lib/editor/render-job.ts` (serial asset download, `buildFilterGraph()`, `spawn(ffmpeg)` with progress parsing) → S3 upload → `Project` status update → 3s client polling. **Confirmed broken in production**, twice, reproducibly (§5, §22) — fails partway through (progress stalled at 20%) with no failure reason persisted anywhere, despite the schema having a dedicated `failureReason` column for exactly this. The refund-on-failure path itself works correctly.

Separately, and independently of the current outage: `POST /api/editor/render` does **not** use the atomic status-transition claim-guard pattern ("H6") that this same codebase already applies correctly and test-covers elsewhere (`autoclip-rerender.ts`, `clips/confirm/route.ts`) — it reads project status, then writes it much later after several awaited operations, with no compare-and-swap tying the two together. Two near-simultaneous export clicks can both pass the check and both enqueue; `spendCredits()` itself is atomic against balance so this cannot overdraw, but it can produce duplicate wasted renders. The same gap exists on the clip `dub`/`publish` routes, which trigger real paid external API calls and real YouTube uploads respectively. Production currently runs the simpler in-process queue driver rather than the fully-built, durable BullMQ path — a render in flight does not survive a process restart.

---

## 16. Performance Audit

Code quality inside the editor is clean: zero `any`/`as any` anywhere in `app/dashboard/editor/` or `lib/editor/`, zero stray `console.*` calls (consistently routed through `lib/logger.ts`), no files over 500 lines except the mostly-declarative `types.ts`. The concrete performance risk is the timeline's lack of virtualization for video/text/audio/image tracks (§7) — a real cliff at the documented 50-clip cap, not a hypothetical one. `render-job.ts` downloads all unique project assets **serially**, and probes each one's audio stream serially immediately after, with no concurrency pool — a project with many unique assets pushes render time toward the fixed 15-minute ffmpeg timeout with no scaling based on document complexity. `getRenderProgress()`'s fine-grained Redis render-stage data is written on every render and read by nothing anywhere in the codebase — dead code.

---

## 17. Responsive Design Audit

A deliberate, reasoned 3-tier strategy, not an accident: below 768px the editor is hard-blocked with an explicit "use AutoClip on mobile instead" message and a link back to the dashboard (justified in-code as "no competitor's web editor attempts full multi-track parity on a phone screen either"); 768–1279px switches sidebar/properties panels to a closed-by-default overlay drawer via a dedicated `matchMedia` hook; ≥1280px is the full designed-for desktop layout. **This audit could not live-verify these breakpoints** — the browser automation environment's window-resize call did not actually change the rendered viewport in this session (`window.innerWidth` stayed 1920 regardless of the requested size), so this section is verified from code only, honestly flagged as such rather than claimed as tested.

---

## 18. Accessibility Audit

Do not read this section as a WCAG compliance claim — none is made. **Keyboard**: the timeline/canvas has zero keyboard-only entry path — clip selection is confirmed mouse/pointer-only everywhere (zero `tabIndex` anywhere in the editor tree); once a clip *is* selected by mouse, the properties panel is fully keyboard-operable via real `<input>` elements. **Focus trap**: `ExportModal` sets `aria-modal="true"` but has no actual focus trap, no Escape handler, and no focus restore on close. **Labels**: the `IconButton` primitive makes `aria-label` mandatory and covers ~41 of ~45 sampled icon-only controls correctly; the `ProfileChip` avatar uses `title` only, and the 4 timeline trim-handle drag targets carry an `aria-label` but aren't keyboard-reachable (no `tabIndex`/`role`). **Contrast**: computed directly from the editor's real theme tokens — `--editor-text-faint` (#55555f) on the editor's dark background is ≈2.4–2.6:1, well under the 4.5:1 AA threshold, and is used for real (non-decorative) UI copy in several panels; disabled controls run as low as ≈1.5:1 (WCAG exempts disabled controls from this requirement, but it is genuinely hard to read). **Motion**: `prefers-reduced-motion` is respected nowhere in the editor despite the pattern already existing elsewhere in this codebase (admin page, KPI cards, product tour) — 9 `infinite` CSS keyframe animations run unconditionally on the live video preview. **Drag alternatives**: every clip type has a numeric alternative to dragging for timing, and Text/Caption have numeric X/Y alternatives to on-canvas dragging; Image/sticker position is drag-only with explicit UI copy telling the user to drag rather than offering a field.

---

## 19. Security Audit

Unusually mature for a codebase this size. FFmpeg/ASS injection is actively, multiply defended: every invocation is `spawn()`/`subprocess.run()` with argv arrays (zero shell-string construction anywhere in the repo), caption text is escaped for ASS override-tag syntax before being written (`escapeASSText`), and text content reaches `drawtext` via a `textfile=` path rather than fragile inline-text escaping — a documented, deliberate design choice to sidestep that entire bug class. Path traversal on uploads is defended with a server-trusted MIME→extension map (never the client filename) plus a whitelist sanitizer, explicitly noting this fixes a previously-real bug in this exact codebase. SSRF is defended on stock-content import via an explicit hostname allowlist. No XSS was found anywhere in the editor's text/caption rendering (plain React child rendering throughout, zero `dangerouslySetInnerHTML`). No command-injection, no missing ownership check, no client-trusted cost or size value was found in this entire pass.

---

## 20. Multitenancy Audit

Every editor-reachable route checked — project GET/PATCH/DELETE, asset list/get/patch/delete/bulk, export trigger (which additionally re-verifies ownership of *every* asset id referenced inside the submitted document, not just the project), stock import/search, and the separate `/api/v1` public-API auth path — scopes its query by `userId` (or, for child rows with no direct `userId` column, via an already-owner-scoped parent relation). No missing ownership filter was found anywhere in this surface. This reads as a deliberately and consistently enforced pattern across the codebase, not incidental correctness.

---

## 21. Credits & Billing Audit

Server-authoritative throughout: every credit cost is a server-defined constant or server-computed value, never taken from the request body. `spendCredits()` uses a single row-locked (`SELECT ... FOR UPDATE`), balance-guarded atomic SQL statement — no read-then-write race, no transient-negative window. Idempotency for AI-operation charges is enforced via a DB unique constraint on `Generation.idempotencyKey`, not client trust. Refund-on-failure was **live-confirmed working correctly, twice**, during this audit's export testing (balance was unaffected by either failed attempt). The one real gap is structural, not financial: the export/dub/publish endpoints lack the atomic double-submit claim-guard used correctly elsewhere in this same codebase (§15), so duplicate near-simultaneous requests can produce duplicate wasted spend-and-refund cycles or duplicate real external-API calls, even though no path exists to actually overdraw a balance.

---

## 22. Error & Recovery Audit

This is where the audit's two live P0s live, and the pattern across both is the same: **failures are refunded correctly but not explained.** Export shows "Render failed — your credit was refunded" with the server-side `failureReason` column left `null` — there is no accessible path, for the user or for this audit, to learn why. Auto-caption generation is worse: it surfaces the raw third-party API error verbatim (`ElevenLabs STT error 400: {"detail":{...},"status":"api_key_id_used_as_api_key",...}`), including an internal reference-doc URL fragment — technically accurate but meaningless and unactionable to a non-technical creator, and a minor information-disclosure smell (leaking internal-provider error shape to end users) rather than a clean, branded failure message. Elsewhere in the codebase the error-message discipline is actually good — sampled API routes return specific, actionable messages ("Add at least one video clip before exporting," "One or more media files are missing from your library," insufficient-credit responses carrying the actual required/balance numbers) — which makes the two flagship-feature failures stand out more, not less. Session-expiry handling has a real gap: no refresh-token flow exists, a 401 on autosave is treated identically to any other network error, and if autosave is stuck in that error state, Export's own "waiting for save" stage never resolves — no timeout, no escape.

---

## 23. Browser Compatibility Audit

Only Chrome was actually testable via this session's automation. No Safari/Firefox-specific runtime testing was performed; any statement about those browsers would be unverified and is deliberately omitted rather than guessed. From code inspection: the compositor is standard HTML5 `<video>`/`<img>` + CSS, with no WebCodecs/MediaSource usage found in the editor path, which is a reasonably conservative, broadly-compatible choice; no browser-specific polyfills or workarounds were found or needed to evaluate further within this audit's scope.

---

## 24. Code Architecture Audit

Genuinely clean where it was inspected: zero `any`/`as any`, zero stray `console.*`, exactly one real TODO in the entire editor tree (a disclosed ⌘K stub), no oversized procedural files. The one architectural fact worth flagging repeatedly because it shapes everything else in this report: **two separate render/AI pipelines (editor vs. AutoClip) sharing infrastructure but not code**, meeting only at credits/queue/S3/one hand-off route. This is not inherently wrong, but it means the editor's "AI-first" story cannot be assessed by looking at the editor alone — most of the capability, and most of the current outage, lives on the other side of that boundary. `TimelineDoc.version` exists and is validated but has zero migration/upgrade tooling anywhere — a future breaking schema change would hard-reject every existing saved project until someone builds that machinery, which doesn't exist today.

---

## 25. Test Coverage Audit

Sharply bimodal. The manual editor's own state layer has **zero** test coverage: `editorStore.ts`, `history.ts` (the undo/redo engine — pure, trivially unit-testable, untested), `useAutosave.ts`, every editor API route (`render`, `captions`, `stock/import`, `stock/search`, `projects`), and roughly 60 UI components. Playwright e2e coverage of the editor is **zero** — 18 e2e specs exist in this repo and none reference `/dashboard/editor`, timeline, autosave, undo/redo, export, or captions in any form. By sharp contrast, AutoClip's business logic is well and specifically tested, including genuine concurrency tests (`"rejects a second concurrent request instead of charging twice"`), a real SSRF-allowlist test, and — notably — the smart-reframe/camera-motion logic (`reframe.ts`, `camera-motion.ts`) is among the **most** rigorously tested code in the repo, including execution-level tests that actually spawn ffmpeg and measure pixel deltas to prove motion is real, written specifically because a past string-only assertion let a real zoom-no-op bug ship undetected. The one confirmed gap inside that otherwise-strong area is `lib/asd.ts` (the ASD→Rekognition→static-crop fallback chain), which has zero test coverage despite implementing a non-trivial, easy-to-get-wrong confidence-rescaling step its own comment flags as risky.

---

## 26. Competitor Capability Gap Matrix

Reused and freshness-dated from an existing, well-sourced internal audit (`docs/autoclip-audit-2026-08.md`, 2026-08-06) rather than re-derived from live competitor testing, since AutoClip owns nearly all the AI capability this comparison concerns. Directional, not measured — the source document itself is explicit that competitor rows are drawn from public documentation and third-party reviews, not first-party testing.

| Capability | Clipiro today | Expected modern behavior | Gap | Priority |
| --- | --- | --- | --- | --- |
| Manual multi-track timeline editing | ✅ (editor) | Standard | Editor and AutoClip are disconnected — no timeline editing *of an AutoClip result* without a one-way hand-off | P2 |
| Auto captions | ⚠️ real architecture, **currently broken** | Reliable, always-on | Live outage (§12, §22) | **P0** |
| Animated/karaoke captions | ✅ (editor + AutoClip) | Standard among leaders | None — genuinely competitive | — |
| Caption templates/emoji/keyword highlighting | ❌ (AutoClip has none beyond color presets) | Category leaders (Submagic) offer rich templates | Real gap | P2 |
| Silence/filler removal | ✅ (AutoClip only, not editor) | Standard | Not surfaced in the editor at all | P2 |
| Smart reframe / speaker tracking | ⚠️ well-built, **currently non-functional in production** | Reliable, "just works" | Live outage (§12) | **P0** |
| Auto-zoom | ⚠️ built, has a compounding-zoom bug | Smooth, bounded | Needs a combined-ceiling fix | P1 |
| Scene/shot detection | ❌ | Standard among leaders | Not built anywhere in the codebase | P2/P3 |
| URL import (YouTube/Drive) | ❌ (upload only) | Standard among leaders | Real gap, high-frequency first action | P2 |
| Review-before-charge / partial refunds | ✅ (AutoClip) — reportedly rare among competitors | — | Genuine differentiator | — |
| Timeline editor on an AI-generated clip | ⚠️ (hand-off exists, one-way) | Standard among leaders | Partial | P2 |
| Multi-language captions (translated, not just dubbed) | ⚠️ dubbing yes, translated-caption-only no | Standard among leaders | Real gap | P3 |

---

## 27. Complexity Reduction Opportunities

**Primary (needed constantly):** playback controls, timeline zoom/scrub, clip selection, save-status indicator, Export.

**Contextual (show only when relevant):** clip properties panel tabs, caption "Generate" credit-cost preview, aspect-ratio picker (arguably could collapse into a single control with the export-resolution choice).

**Advanced (hide under expansion):** per-clip Adjust/Animation tabs already do this correctly; the "AI Tools (Coming Soon)" sections should either be genuinely hidden until real or clearly removed rather than left as a permanent, non-functional fixture — three near-identical disabled sections currently occupy real UI real estate for zero present value.

**Remove or fix before launch:** the Notifications bell with no handler and the ⌘K chip should not ship in their current "looks clickable, does nothing" state — either wire them or remove them. The `VideoClipProps.tsx` "preview only" copy should be corrected immediately; it is actively misleading users away from a working feature at essentially zero engineering cost to fix.

---

## 28. P0 — Launch Blockers

### [P0-1] Auto-caption generation is broken in production
**Area:** AI Editing / Captions
**Evidence:** Live browser test, `POST /api/editor/captions` on the real project returned `ElevenLabs STT error 400: {"detail":{"type":"authentication_error","code":"invalid_api_key_id_used_as_api_key",...}}`. Root cause matches `docs/autoclip-e2e-report-2026-08.md` §4.2, dated 2026-08-08.
**Current behavior:** The editor's only real AI feature fails 100% of the time and shows the user a raw provider error.
**Expected behavior:** Captions generate successfully; on failure, a branded, actionable message.
**User impact:** Total loss of the product's core AI promise inside the editor.
**Technical cause:** `ELEVENLABS_API_KEY` in the production environment is a key *ID*, not a valid key (valid keys start with `sk_`).
**Recommended fix:** Rotate to a real ElevenLabs API key; set `OPENAI_API_KEY` as a real fallback (currently unset, per the same prior audit, making this a single point of failure); wrap the client-facing error in a branded message.
**Verification method:** Re-run captions generation on a real project in production and confirm real word-level cues are produced; re-run `scripts/autoclip-e2e.ts`, which is documented to self-report when STT coverage is exercised.

### [P0-2] Export (render) is broken in production
**Area:** Export
**Evidence:** Live browser test, two independent real Export attempts both failed at `progress:20`. Direct `GET /api/projects/[id]` check showed `status:"failed"`, `failureReason:null`, `warnings:null`.
**Current behavior:** Export fails; the reason is not recorded anywhere accessible, server-side or client-side.
**Expected behavior:** Export succeeds for a straightforward single-video-plus-text project; on genuine failure, the reason is persisted and surfaced.
**User impact:** The product's single most important action does not work.
**Technical cause:** Unknown from this audit's vantage point — `lib/editor/render-job.ts`'s catch path does not set `Project.failureReason` despite the schema column existing for exactly this purpose. Requires server-side log/Sentry access to diagnose further.
**Recommended fix:** Immediately: populate `failureReason` on every catch path in `render-job.ts` so this is diagnosable at all. Then: reproduce with server log access and fix the underlying cause (given the timing and shared infrastructure with the ElevenLabs outage, check for an unrelated-looking but shared root cause, e.g. a shared credential/network egress issue, before assuming it's project-specific).
**Verification method:** Re-run Export on the same project after the fix; confirm `videoUrl` populates and the resulting file downloads and plays.

### [P0-3] AutoClip speaker-tracking and transcription are broken account-wide, ongoing 14+ days
**Area:** AI Editing (AutoClip)
**Evidence:** Live check of this account's project history: 8 of 13 projects "Failed." The one "Completed" project displays, today, two warning banners: transcription failure (generic placeholders, no burned-in subtitles) and "Speaker tracking couldn't run on our side... This affects every video until it's fixed." Root cause documented in `docs/autoclip-e2e-report-2026-08.md` §4.1 (missing AWS Rekognition IAM permissions) and §4.2 (same ElevenLabs key issue as P0-1), dated 2026-08-08.
**Current behavior:** Every AutoClip render gets a static center crop regardless of speaker tracking settings; upload moderation scanning is also silently disabled by the same IAM gap.
**Expected behavior:** Speaker tracking runs as designed (it is, per independent code review, one of the more sophisticated and well-tested parts of the codebase); transcription succeeds.
**User impact:** The flagship AI-editing product AutoClip is degraded to "static crop with placeholder captions" for every user, silently, for at least two weeks.
**Technical cause:** IAM policy missing `rekognition:StartFaceDetection`/`GetFaceDetection`/`DetectModerationLabels`; invalid ElevenLabs key (shared root cause with P0-1).
**Recommended fix:** Attach the missing IAM permissions; fix the ElevenLabs key (same action as P0-1 closes this too).
**Verification method:** Run a fresh AutoClip project with a multi-speaker source and confirm the reframe warning banner is absent and the output shows real speaker-tracked framing, not a center crop.

### [P0-4] Deep link to a project while unauthenticated never returns the user to it
**Area:** Auth / Session
**Evidence:** Live browser test: navigating to `/dashboard/editor?projectId=X` while logged out redirected to `/tools/video-editor` with the query string stripped entirely. Code: `proxy.ts`'s redirect never carries the original path/query (`app/components/featureLinks.ts`); the client-side `AuthModal.tsx`'s post-login redirect is hardcoded to `/dashboard`/`/dashboard?billing=1` regardless of where the modal was opened from; no `next=`/`redirect=` parameter exists anywhere in this codebase.
**Current behavior:** A shared or bookmarked project link, once the session has expired, permanently loses its destination.
**Expected behavior (per this audit's own brief):** Authenticate, then return to the same project.
**User impact:** Broken sharing/bookmarking workflow; anyone whose session lapses mid-edit or who receives a shared link while logged out loses the destination and must manually navigate back.
**Technical cause:** No `next=` parameter support anywhere in the login/auth-modal flow.
**Recommended fix:** Add a `next=` (or similar) parameter, threaded through both the server-side redirect and the client-side `AuthModal`'s post-login navigation.
**Verification method:** Repeat this audit's exact reproduction steps post-fix and confirm the final destination is the originally-requested project.

### [P0-5] Autosave has no concurrency protection — confirmed data-loss path
**Area:** Autosave / Persistence
**Evidence:** `prisma/schema.prisma`'s `Project` model has no `updatedAt`/version column; `app/api/projects/[id]/route.ts`'s PATCH is an unconditional `prisma.project.update()`. Independently corroborated by two separate research passes and by an existing uncommitted report (`scratch/editor-autoclip-parity-report.md`) that had already flagged and deferred the same gap.
**Current behavior:** Two open tabs, or a slow save racing a newer one, silently overwrite each other with no detection.
**Expected behavior:** A newer save should never be silently clobbered by an older, in-flight one; the user should be warned on genuine conflict.
**User impact:** Silent loss of edits with no error, no warning, and no recovery path.
**Technical cause:** No optimistic-concurrency mechanism (version column, `If-Match`, or timestamp check) exists on the autosave endpoint.
**Recommended fix:** Add a version/`updatedAt` column to `Project`; have the client send its last-known version on every `PATCH`; reject (409) or merge on mismatch rather than blind overwrite.
**Verification method:** Open the same project in two tabs, make conflicting edits in both, and confirm the second save is rejected/flagged rather than silently winning.

### [P0-6] Caption line-regrouping can silently corrupt a project (parity branch, pre-merge)
**Area:** Captions — `feat/editor-autoclip-parity`, not yet merged
**Evidence:** Empirically reproduced in an isolated worktree: a manual caption cue plus two AI-generated word bursts, regrouped under "three-lines" mode, produces an overlapping/invalid document that `validateDoc()` rejects — but autosave's `PATCH` handler never calls `validateDoc()`, so the corruption saves silently and only surfaces as a cryptic 400 at export time, with the project then stuck.
**Current behavior (on this branch, not yet shipped):** Using the new "Lines" feature on a mixed AI+manual caption track can permanently break the project's ability to save-and-export coherently.
**Expected behavior:** Regrouping should either preserve validity or reject the operation with a clear message before it's applied.
**User impact:** Would be severe if merged as-is — silent corruption with no visible symptom until a later export attempt fails cryptically.
**Technical cause:** `regroupCaptionWords()` flattens and re-chunks words from all word-bearing cues without accounting for interleaved manually-typed cues; autosave doesn't run full validation as a safety net.
**Recommended fix:** Either exclude time-overlapping manual cues from the regroup window, or run `validateDoc()` before committing a regroup and block/warn on failure, before this branch merges.
**Verification method:** Re-run this audit's exact reproduction (documented in the worktree verification pass) after the fix and confirm `validateDoc()` passes.

---

## 29. P1 — High Priority

- **Export/dub/publish endpoints lack an atomic double-submit guard** that this same codebase already implements correctly elsewhere (`autoclip-rerender.ts`, `clips/confirm/route.ts`) — duplicate near-simultaneous requests can produce duplicate wasted renders or duplicate real external API calls (dub, YouTube publish). *Editor + AutoClip.*
- **Session-expiry dead end** — no refresh-token flow; a 401 on autosave is indistinguishable from a network error; Export can hang indefinitely on "waiting for save." *Editor.*
- **Timeline has zero virtualization** for video/text/audio/image tracks (only captions window by scroll range) — a real, code-confirmed performance cliff as clip count approaches the documented 50/track cap. *Editor.*
- **`VideoClipProps.tsx` falsely claims Effects/Transitions are preview-only** when they are genuinely exported — actively discourages use of a working feature. *Editor.*
- **Three caption style fields have undisclosed export mismatches**: `shadow.color`/`shadow.opacity` and `lineHeight` silently no-op at export; `highlightMode` is incorrectly badged preview-only when it's real and load-bearing. *Editor.*
- **Crop + background combined silently mismatches preview vs. export** — the export code's own comment claims parity with preview that does not exist. *Parity branch, pre-merge.*
- **AutoClip's two independent zoom systems compound past either one's own safety ceiling** (~1.3× stated max, ~1.6× achievable) — a genuine architecture gap with no combined guard. *AutoClip.*
- **Rate-limit gaps** on autosave (`PATCH /api/projects/[id]`) and auto-caption generation (credit-consuming) — both unrestricted, unlike sibling routes. *Editor.*
- **Zero automated test coverage of the manual editor's own logic** — state store, undo/redo history, autosave hook, all API routes, and ~60 components; zero e2e coverage of the editor at all. *Editor.*
- **AWS Rekognition IAM gap also silently disables upload moderation scanning** — a content-safety gap riding along with the reframe outage. *AutoClip.*
- **Production runs the non-durable in-process queue driver** rather than the fully-built BullMQ path for both render pipelines — an in-flight render does not survive a process restart. *Editor + AutoClip.*

---

## 30. P2 — Medium Priority

- `TimelineDoc.fps` is fully decorative (never read at export) — misleading if assumed configurable.
- `snapEnabled` toggle exists with no UI control anywhere — dead code, always-on.
- `AudioClip` has no mute/fade fields in the schema; no waveform rendering anywhere in the app.
- Ducking is built but wired into AutoClip only, not the manual editor's render path.
- Three real, working standalone audio-AI tools (noise removal, vocal remover, loudness balancer) are not linked or discoverable from inside the editor.
- Two disconnected undo systems (app-level vs. Lexical) — coherent today only via an incidental focus-guard.
- `ExportModal` has no real focus trap despite `aria-modal="true"`.
- Timeline/canvas has zero keyboard-only entry path — mouse/pointer required to select anything.
- No `prefers-reduced-motion` support anywhere in the editor despite the pattern existing elsewhere in this codebase.
- Project documentation (AGENTS.md) incorrectly claims "no dark mode" — the editor route runs a genuinely separate dark theme.
- `TranscriptPanel`'s auto-scroll fights itself (can't distinguish its own programmatic scroll from a real user scroll). *Parity branch.*
- `useAutosave.ts` discards the server's actual error message on save failure, showing only a generic "Save failed" pill.
- `getRenderProgress()`'s Redis render-stage data is written every render and read by nothing — dead code.
- `lib/asd.ts` has zero test coverage despite a non-trivial, self-flagged-as-risky confidence-rescaling step, in sharp contrast to the otherwise rigorously-tested reframe/zoom logic surrounding it.
- `render-job.ts` downloads all unique assets serially with no concurrency, pushing large projects toward the fixed 15-minute ffmpeg timeout.
- `Project` has no `updatedAt` column — can't sort a user's own projects by recently edited.
- `TimelineDoc.version` is validated but has zero migration/upgrade tooling for any future breaking schema change.

---

## 31. P3 — Future Improvements

- Notifications bell has no `onClick`; the ⌘K chip is a disclosed but non-functional stub — wire both or remove them.
- No on-canvas resize/rotate handles for clips other than the (unmerged) video crop feature; `ImageClip` has no rotation field at all; image/sticker position is drag-only with no numeric alternative.
- No safe-area visual guides rendered on canvas.
- Disabled "Coming Soon" AI buttons use the native `disabled` attribute, so their explanatory tooltip is mouse-hover-only, never keyboard-reachable.
- A few low-contrast text tokens in the editor's dark theme, used for real (non-decorative) copy.
- `ProfileChip` uses `title` only, not `aria-label`, inconsistent with the rest of the icon-button pattern.
- Caption preset naming (16 presets) not reconciled against any external reference set — a product decision, not a defect.
- The parity branch's default panel silently changed from Media to Transcript, undocumented in its own commit message.
- `TrackHeader.tsx` has no per-track lock/hide affordance yet (disclosed as out-of-scope for that pass in its own header comment).

---

## 32. Recommended Implementation Sequence

### Stage 1 — Data integrity & blockers
Fix the two live production outages (P0-1/P0-2/P0-3 — very likely one shared root-cause investigation, since ElevenLabs is implicated in both P0-1 and P0-3, and P0-2's silent failure needs `failureReason` logging before it can even be diagnosed). Add autosave optimistic concurrency (P0-5). Fix the deep-link-after-login flow (P0-4). Fix or block-before-merge the caption-regroup corruption bug on the parity branch (P0-6).

### Stage 2 — Core editor reliability
Add the atomic double-submit guard to export/dub/publish. Add rate limits to autosave and caption generation. Persist `failureReason` on every render failure path generally, not just as a P0-2 patch. Add a refresh-token flow or at least a clear "session expired, please re-login" state distinct from a generic save error.

### Stage 3 — Timeline & editing UX
Virtualize `TimelineTrack.tsx` for video/text/audio/image. Fix the `VideoClipProps.tsx` Effects-tab copy bug. Either wire up or remove the Notifications bell and ⌘K chip.

### Stage 4 — Captions/audio
Fix the three caption export-mismatch fields (shadow color/opacity, lineHeight, highlightMode badge). Add mute/fade to `AudioClip`. Wire ducking into the manual editor. Surface the existing noise-removal/vocal-remover/loudness tools from inside the editor. Add basic waveform rendering.

### Stage 5 — AI-first editing
Decide and execute a real integration story between the editor and AutoClip's AI capability (silence/filler removal, smart reframe, auto-zoom) rather than leaving them as two disconnected pipelines. Fix AutoClip's compounding-zoom bug. Either build the three "Coming Soon" AI-tool sections or remove them.

### Stage 6 — Performance
Parallelize `render-job.ts`'s serial asset downloads. Address the timeline virtualization gap from Stage 3 if not already resolved. Move production to the durable BullMQ queue driver.

### Stage 7 — UX polish
Fix `ExportModal`'s focus trap. Add keyboard-only timeline entry. Add `prefers-reduced-motion` support. Address the flagged low-contrast tokens.

### Stage 8 — Production verification
Full re-run of this audit's browser checklist post-fix, on both production and, once merged, the parity branch's new features; add the currently-missing automated test coverage (editor store, undo/redo, autosave, API routes) and at least a minimal Playwright e2e suite for the editor before calling this stage closed.

---

## 33. Final Release Gate Checklist

| Requirement | Status |
| --- | --- |
| Core editing (trim/split/move/delete/undo/redo) works | PASS |
| Autosave persists edits across refresh | PASS |
| Autosave protects against concurrent-tab data loss | FAIL |
| Export produces a working video | FAIL |
| Auto-captions generate successfully | FAIL |
| Deep links survive a login redirect | FAIL |
| Tenant isolation across all editor/asset routes | PASS |
| No client-trusted billing values | PASS |
| No injection surface (FFmpeg/ASS/path/SSRF) | PASS |
| Refund-on-failure works | PASS |
| Export endpoint is race-safe against double-submit | FAIL |
| Timeline performs acceptably at documented scale limits | PARTIAL (unvirtualized, not yet measured under real load) |
| Editor/export visual parity | PARTIAL (2 confirmed mismatches, 1 mislabeled UI claim) |
| Accessibility: keyboard-only editing possible | FAIL |
| Accessibility: labeled controls | PARTIAL |
| Responsive behavior at documented breakpoints | NOT VERIFIED (environment limitation, code-verified only) |
| Automated test coverage of editor-specific logic | FAIL |
| AI-editing capability (as scoped in this brief) present in the editor | PARTIAL (mostly lives in AutoClip, which is itself currently degraded) |

---

## 34. Final Recommendation

### Can Clipiro Editor be released to paying customers today?

**NO.**

Not because the underlying architecture is weak — it is, in most places, genuinely well-built: mature tenant isolation, a hardened FFmpeg/injection posture, atomic credit handling, clean and well-typed editor code, and a core hand-editing experience that worked correctly on every interaction tested live. The blocker is that the two things a paying video-editing customer does first — export a video and generate captions — are both **confirmed broken in production right now**, alongside a sibling pipeline (AutoClip) that has been silently degraded for at least two weeks and an autosave system with a genuine, unmitigated data-loss path. None of these are architectural rewrites; they read as a small number of specific, fixable defects (an invalid API credential shared across two failure modes, a missing IAM policy, a missing version column, a missing redirect parameter) sitting on top of an otherwise reasonable foundation.

**What must happen before launch, in order:** (1) diagnose and fix the export failure — first by logging `failureReason` so it's diagnosable at all, then by fixing the root cause; (2) rotate the ElevenLabs credential and set a real OpenAI fallback, which very plausibly closes both the editor's caption outage and AutoClip's transcription/reframe outage in one action; (3) attach the missing Rekognition IAM permissions; (4) add autosave optimistic concurrency; (5) fix the deep-link-after-login flow. Once those five are verified fixed — by literally repeating this audit's browser checklist against production — the product is in a materially different, launch-plausible state, and the remaining P1/P2 findings become genuine roadmap items rather than blockers.
