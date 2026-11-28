# Clipiro Editor — Gap Analysis vs CapCut & DaVinci Resolve + Phased Plan (2026-11-28)

## Context
The editor (`app/dashboard/editor/`, about 11.7k lines) already does a lot:
- 7 left-panel groups.
- A properties panel on the right.
- 5 timeline lanes.
- An ffmpeg export with 150 caption templates.
- Text keyframes.
- Silence and filler-word cutting.
- AI text tools.

Compared with CapCut and Resolve, three things hold it back:
1. **The data model is fixed.** There is one lane each for video, image, text, audio and captions. You can select only one clip at a time. Video has no position, scale or rotation, and only text has keyframes.
2. **The properties panel is uneven.** Images get start, duration, size and opacity. Video has no Transform tab. Audio has no tabs at all.
3. **Most of the AI already built in the app never reaches the editor.** Background remover, voiceover, voice isolation, dubbing, reframe, B-roll, upscale and image generation all exist as tool pages or AutoClip steps.

The user wants a clean, professional editor in the style of CapCut and Resolve, with AI everywhere. The deliverable is (a) the gap document and (b) a plan, phase by phase.

After approval, the gap document and this plan are published as an Artifact page. A copy also goes in the repo at `docs/editor/EDITOR_GAP_ANALYSIS.md`.

---

## Part A: Gap analysis

Ratings: ✅ we have it · 🟡 partial or preview-only · ❌ missing. P0 to P3 is priority, P0 highest.

### A1. Timeline
| Feature | CapCut | Resolve | Clipiro | Gap | Pri |
|---|---|---|---|---|---|
| Add, remove or reorder any number of tracks | ✅ | ✅ | ❌ 5 fixed lanes | New track model | P0 |
| Several video layers (picture-in-picture, overlay) | ✅ | ✅ | ❌ 1 video lane | Layered video | P0 |
| Main track that closes gaps automatically | ✅ | – | 🟡 video lane pushes clips along | Make it a mode you can turn on and off | P1 |
| Select several clips (Shift, Ctrl, box select) | ✅ | ✅ | ❌ one clip at a time | Selection becomes a set | P0 |
| Split any clip type | ✅ | ✅ | 🟡 video and captions only | Split text, image and audio | P0 |
| Ripple delete or trim, plus delete left/right of playhead (Q/W) | ✅ | ✅ | 🟡 only from silence and filler cuts | General ripple editing | P1 |
| Slip, slide and roll edits | 🟡 | ✅ | ❌ | Trim modes | P2 |
| Track mute, lock and hide | ✅ | ✅ | ❌ (lock/hide per clip only) | Track header controls | P0 |
| Audio waveforms | ✅ | ✅ | ❌ | Compute peaks, draw on clips | P0 |
| Markers (timeline and clip) | ✅ | ✅ | ❌ | Markers, M key | P1 |
| Group, compound or link clips; separate audio from video | ✅ | ✅ | ❌ | Groups and links | P1 |
| Freeze frame, reverse, replace clip | ✅ | ✅ | ❌ | Clip actions | P1 |
| Speed curves (ramps) | ✅ | ✅ | 🟡 fixed 0.25× to 4× | Speed curve presets | P2 |
| Right-click menu on clips | ✅ | ✅ | ❌ (`ContextMenu` primitive exists) | Wire it in | P0 |
| Keyframe diamonds on every clip | ✅ | ✅ | 🟡 text only | Generic keyframes | P0 |
| Adjustable transition length | ✅ | ✅ | ❌ fixed 0.5s | Duration field and drag | P1 |
| Clip limits | – | – | 50 per track, fps fixed at 30 | Raise limits; 24/25/60 fps | P2 |

### A2. Preview and canvas
| Feature | CapCut | Resolve | Clipiro | Pri |
|---|---|---|---|---|
| Handles to resize and rotate on the canvas | ✅ | ✅ | ❌ ring outline and drag only | P0 |
| Snapping guides for centre, edges and other layers | ✅ | 🟡 | ❌ | P1 |
| Safe-zone overlays (TikTok, Reels, Shorts UI) | 🟡 | ✅ | ❌ | P1 |
| Full screen, zoom (fit/50/100%), preview quality | ✅ | ✅ | ❌ | P1 |
| Loop or in-out range, JKL shuttle, frame readout | ✅ | ✅ | ❌ (play/pause and time only) | P1 |
| Several audio clips heard together in preview | ✅ | ✅ | ❌ (first audio clip only) | P0 bug |
| Image fades shown in preview | – | – | ❌ (export does them, preview doesn't) | P0 bug |
| Background colour or blur for the canvas | ✅ | – | 🟡 blur only for "fit" clips | P2 |

### A3. Properties panel (right side)
CapCut's layout is **Video → Basic / Remove BG / Mask / Retouch**, **Audio**, **Speed**, **Animation**, **Adjust**, **AI effects**. Every property has a keyframe diamond beside it.

| Clip type | Missing now |
|---|---|
| Video | Transform (position, scale, rotation, flip, opacity), crop rectangle, blend modes, mask, chroma key, stabilise, keyframes, speed curves, reverse, separate audio tab with volume curve and denoise |
| Image | Rotation, flip, crop, blend, mask, keyframes, a proper Transform panel (position today is drag only), animation presets |
| Audio | Tabs, speed and pitch, keyframed volume, denoise and enhance, voice effects, loop, beat markers |
| Text | Entrance/loop/exit animations, rotation, gradient, letter spacing and shadow blur don't export; no curved text, no bubble or sticker text, no styled text saved as a template |
| Captions | Background colour and active-word scale don't export; the wrong "preview-only" badge on Highlight (`CaptionClipProps.tsx:46`); no translate-all, no speaker labels in the editor |
| Consistency | Each clip type has its own tab list (`tabConfig.tsx`). The plan is one shared Inspector made of sections that every type reuses, plus reset and copy-paste attributes |

### A4. Effects, filters, transitions, animation
| Area | Clipiro today | Target (CapCut-class) |
|---|---|---|
| Filters | 10 | Around 40 in categories, plus importing `.cube` LUT files (ffmpeg `lut3d`) |
| Colour | 4 sliders | Basic (exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation, vibrance, sharpen, vignette), HSL per colour, RGB curves, auto colour |
| Effects | 10 | Around 30 in categories (body/zoom, glitch, retro, light leak, blur, lens), all exported |
| Transitions | 9 work, 1 hidden (`zoomOut`) | Around 25 (blur, spin, zoom, whip, luma wipes, glitch), length you can change, all exported |
| Clip animations (in/out/combo) | text only, preview only | Every visual clip type, exported |
| Stickers | Giphy stills | Animated stickers (GIF/WebM overlays), emoji |
| Sound effects | ❌ | SFX library plus AI-generated SFX |
| Project templates | ❌ | Starter templates (hook + captions + music) |

### A5. Audio
Missing in the editor:
- Mic recording.
- Text-to-speech voiceover.
- Noise reduction and voice isolation.
- Voice changer.
- Loudness normalising.
- Speed and pitch.
- Beat detection.
- Ducking without captions (driven by voice detection).
- Real multi-clip mixing in preview (Web Audio).
- A volume level meter.

### A6. AI (where we can stand out)
| AI feature | Built in the app? | In the editor? | Plan |
|---|---|---|---|
| Auto captions + 150 templates | ✅ | ✅ | Keep; add translate-all and speaker colours |
| Remove silences and filler words, cut by editing the transcript | ✅ | 🟡 | Full transcript editing: delete words to cut video |
| AI text: rewrite, hook, title, CTA | ✅ | ✅ | Keep |
| Remove background (image) | ✅ fal rembg | ❌ | Inspector "Remove BG" on image clips |
| Remove background (video) | ❌ | ❌ | New: a fal video matting model |
| Auto reframe with face tracking | ✅ AutoClip | ❌ | "Smart reframe" on video clips, writes focus keyframes |
| AI B-roll generation | ✅ AutoClip | ❌ | "Generate B-roll" for a transcript range, lands on an overlay track |
| TTS voiceover | ✅ tool page | ❌ | Audio → Voiceover tab |
| Enhance voice / isolation | ✅ tool page | ❌ | One toggle per audio or video clip |
| Voice changer | ✅ tool page | ❌ | Audio-tab effect |
| Vocal remover (Demucs) | ✅ tool page | ❌ | "Separate vocals/music" action |
| Dubbing / translate audio | ✅ AutoClip | ❌ | Project-level "Dub" |
| Translate the whole caption track | ✅ AutoClip only | 🟡 one cue at a time | Wire `lib/caption-translate.ts` |
| Image generation and photo edit | ✅ | 🟡 sent over as assets | "Generate image" in the Media panel |
| Upscale (SeedVR) | ✅ model listed | ❌ | Export option or clip action |
| Subtitle remover | ✅ tool page | ❌ | Clip action |
| AI SFX and music generation | ❌ | ❌ | ElevenLabs Sound Effects API; music later |
| Beat sync (auto-cut to music) | ❌ | ❌ | Beat detection → markers → "Cut to beat" |
| AI copilot ("make it punchier", "add captions and music") | 🟡 assistant has no editor tools | ❌ | Editor actions behind the Ctrl+K palette |
| Auto colour / match colours | 🟡 ffmpeg match | 🟡 | Add one-click auto-enhance |
| Script to video, with forced alignment | 🟡 Scribe / forced alignment exist | ❌ | P3 |

### A7. Export
- Missing: MOV, WebM, GIF and audio-only export; choice of frame rate and bitrate; exporting an in-out range; VTT and TXT caption files; a burned-in vs separate captions toggle.
- Bug: AutoClip's hand-off to the editor places captions as text clips, so captions may show twice. Not verified yet.

---

## Part B: Phased implementation plan

Each phase is one branch and one PR (or a short stack), branched from `main`. Each phase meets the house bar:
- Every CI step run locally, lint included.
- Checked in Claude in Chrome on a signed-in local build.
- Every new visual property is honoured by **both** `PreviewStage` and `lib/editor/filtergraph.ts`, or the panel shows `PreviewOnlyBadge`.

### Phase 0: Fix what's wrong today (small PR)
- Image fade in preview: `PreviewStage.tsx:208-213` should use the same fade helper as text.
- Mix several audio clips in preview: replace `audioClipAt` (`timeline-utils.ts:34`) with a list of all active clips, one `<audio>` each, synced in `usePlayback`.
- Remove the wrong preview-only badge on caption Highlight (`CaptionClipProps.tsx:46`).
- AutoClip "edit in editor" should send caption **cues**, not text clips, and not double them when the render already has burned-in captions (`app/api/projects/[id]/clips/[clipId]/edit-in-editor`).
- Wire `ContextMenu` onto timeline clips (Split, Duplicate, Delete, Lock, Hide, Copy/paste attributes).
- Show the hover toolbar (rename, duplicate, delete, lock, hide) on every clip type, not just text (`TimelineClip.tsx:186`).
- Auto-captions transcribe only the trimmed part of each clip, not the whole asset (`app/api/editor/captions`). This saves Clip Minutes.
- Clean up leftovers: the unused `"keyboard"`, `"aiCaptions"` and `"aiVideo"` values in `PanelKind`.

### Phase 1: Timeline data model v2 (the foundation)
- In `packages/shared/src/editor/timeline.ts`:
  - Add `TimelineDoc` version 2: `tracks: Track[]`, where a track is `{id, kind: video|overlay|text|audio|caption, name, muted, locked, hidden, clips[]}`.
  - Add a shared `Transform {x, y, scale, rotation, flipH, flipV, opacity}` and `crop {l, t, r, b}` on every visual clip.
  - Add `blend?`.
  - Add a generic `keyframes?: Record<Prop, Keyframe[]>` with easing.
  - Add `markers[]`, plus `groupId?` and `linkId?`.
- Write a pure `migrateV1toV2()` that runs on load and in `validateDoc`. Unit test it against every v1 field. v1 docs saved in prod must open unchanged.
- Store (`store/editorStore.ts`):
  - `selection` becomes a set.
  - Track actions: add, remove, reorder, mute, lock, hide.
  - Split works on every clip type.
  - Ripple delete, delete to left/right of playhead.
  - Group, ungroup, separate audio.
  - Per-track placement rules: video/main is magnetic and can't overlap; the others are free.
  - A "Main track magnet" switch that turns magnetic placement on and off (CapCut-style).
  - Ducking works on every audio track (voice-over, SFX), not only music clips.
- `filtergraph.ts`:
  - Loop over tracks bottom to top.
  - Overlay tracks get `overlay` with `scale`/`rotate`/`crop`/opacity, and blend for the common modes.
  - Keyframes use the existing text keyframe expression builder (`lib/editor/keyframes`), made generic.
- Raise the clip cap; add an fps choice (24/25/30/60).

### Phase 2: Timeline UI rebuild
- Rebuild `timeline/` around dynamic tracks:
  - Track headers with mute, lock, hide and rename; "+ Add track"; drag to reorder.
  - Box select and Shift/Ctrl click.
- Audio waveforms:
  - On upload/import, a worker computes peaks (ffmpeg `astats` or a `showwavespic`-style pass) and stores JSON on the Asset.
  - `TimelineClip` draws them on a canvas.
- Markers (M), snapping to markers, keyframe diamonds on every clip, transition chips you can drag to change length.
- Clip actions: freeze frame, reverse (render a reversed proxy in the worker), replace clip, copy/paste attributes.
- Trim modes: slip (Alt+drag the middle of a clip), slide, and roll (drag the cut between two clips).
- Shortcuts: Q/W/E (delete to left, delete to right, split), J/K/L, I/O range, Ctrl+G group, N toggles snapping.

### Phase 3: Preview canvas
- On-canvas transform handles (corners scale, rotation knob, crop mode) for every visual clip, plus centre and edge snapping guides.
- `PreviewControls`: full screen, zoom (fit/50/100/200), preview quality (half resolution), loop range, timecode with frames, safe-zone overlay (9:16 TikTok/Reels/Shorts UI masks).
- **Rendering: a GPU preview engine replaces DOM compositing.**
  - New `app/dashboard/editor/engine/`:
    - WebCodecs `VideoDecoder` per source, fed by mp4box.js demux, with a frame cache around the playhead.
    - One WebGL2 canvas draws every track bottom to top: transform, crop, opacity, blend.
    - Effects, filters, LUT (3D texture), curves, HSL, chroma key and masks run as shader passes.
    - Text and captions render to offscreen canvases (the same `CaptionTemplateRender` output) and are drawn as textures.
  - Each shader pass is defined next to its ffmpeg counterpart in one preset registry, so preview and export can't drift.
  - Fallback: if WebCodecs is missing (old Safari), use `<video>` → `texImage2D` uploads.
  - A Web Audio graph (Phase 6) runs off the same clock.
  - The current DOM preview stays behind a flag until the engine passes the golden-export checks.
  - This becomes the prerequisite for Phases 4 and 5. Phase 3 grows to about 3 weeks.
- Canvas background: a colour or a blurred copy of the video.

### Phase 4: Inspector rebuild (the right-hand panel)
- Replace the per-type props files with `properties/sections/*`. Each type picks the sections it needs in `tabConfig.tsx`. Sections:
  - TransformSection, CropSection, BlendSection, SpeedSection (normal + curve presets), AnimationSection (in/out/combo for every visual clip)
  - AdjustSection (Basic / HSL / Curves / LUT)
  - MaskSection (linear, mirror, circle, rectangle, feather, invert)
  - ChromaKeySection, AudioSection (volume curve, fades, denoise, voice effect, speed/pitch)
  - AiSection (see Phase 6)
  - StabiliseSection: ffmpeg `vidstabdetect`/`vidstabtransform` run as a worker job that makes a stabilised proxy asset. Three levels: low, medium, high.
  - Audio loop: the clip repeats to fill its length (`aloop` at export, looping in preview).
- A `KeyframeToggle` diamond beside each property that can animate, with easing (linear, ease in/out, bezier).
- On every section: "Reset", "Apply to all", and copy/paste attributes.
- Look and feel: tighten spacing and type to the `--editor-*` tokens. Use the shared `app/components/ui` primitives (Tabs, Switch, Field, Tooltip, Dropdown). No side drawers: on small screens the panel opens full screen, as it does now on phones.
- Export: every section maps to filtergraph. Text animations become exportable by rendering text as an animated ASS layer or a PNG sequence via the caption engine, so `PreviewOnlyBadge` mostly goes away.
- These preview-only settings are exported in the same pass:
  - Text: rotation, gradient, letter spacing, shadow blur, and mixed styles inside one text clip (today they're flattened to plain text).
  - Captions: background colour, active-word scale and opacity, entrance/loop/exit animations.
  - The goal is zero `PreviewOnlyBadge` uses by the end of Phase 4.
- Captions: speaker labels and a colour per speaker in the editor (Scribe already returns `speaker`), with "Style speaker A/B".

### Phase 5: Effects, filters, transitions, stickers, SFX library
- Make the preset tables data-driven, each with: id, category, a preview CSS or shader, an ffmpeg graph builder, and a thumbnail. Reach about 40 filters, 30 effects and 25 transitions, including luma wipes (ffmpeg `xfade` custom expressions). Fix `zoomOut`.
- LUT upload (`.cube`) saved as an Asset; preview it with a WebGL 3D texture, export it with `lut3d`.
- The Effects panel gets category chips, hover previews, drag-and-drop onto a clip or cut, and favourites.
- Animated stickers: keep Giphy MP4/WebM and overlay them as video on an overlay track. Add an emoji sticker tab (Twemoji/Noto PNGs, open licence).
- Sound-effects tab: Pexels has no SFX, so use Freesound, or pre-made ElevenLabs SFX packs.
- Text templates: sticker-style and bubble text, curved text (render to PNG), and saving a style as "my template".

### Phase 6: Audio suite + AI audio in the editor
- New sub-tabs in the Audio panel: **Voiceover** and **Record**.
  - Voiceover reuses `app/api/tools/voiceover` with the voice catalogue, writes an Asset and places it at the playhead.
  - Record uses `MediaRecorder` → upload.
- Clip actions in the audio section:
  - Enhance voice (ElevenLabs isolation), Change voice, Separate vocals (Demucs).
  - Each runs as a job, creates a new Asset version and swaps `assetId`, so it can be undone.
- Normalise loudness (`loudnorm`) at export as an option.
- Ducking from voice detection, using ffmpeg `silencedetect` output we already compute (`lib/editor/silences`), so it no longer needs captions.
- Beat detection: a worker step (onset detection, or the aubio CLI) writes markers. "Cut to beat" splits B-roll to the markers.
- AI sound effects: ElevenLabs Sound Effects API from a text prompt.
- AI music generation: an "Generate music" box (mood, length, energy). Use ElevenLabs Music, which is on the Starter plan we're on, or a fal music model. Music is credit-gated, and Jamendo stays as the free option.
- Script-to-voice with forced alignment:
  - The user pastes a script, TTS reads it, and ElevenLabs Forced Alignment gives word timings.
  - Those timings become caption cues that match the voice exactly.
  - It reuses the forced-alignment work already merged in #198.
- Preview: a Web Audio mixer (gain per clip and per track, fades, a volume meter).
- Credits: every AI call goes through the existing credits/minutes charging and refund pattern (`app/api/editor/render/route.ts`).

### Phase 7: AI video tools in the editor
A Video "AI" section and right-click actions, each a thin route under `app/api/editor/ai/*` that calls services we already have:
- **Remove background:** images via fal rembg, which already exists. Video is new, using a fal video-matting model. The output is a WebM/ProRes-alpha asset placed on an overlay track.
- **Smart reframe:** run the AutoClip reframe service (`lib/autoclip-ai/reframe.ts`, `camera-path.ts`) on one clip and write focusX/focusY keyframes.
- **Generate B-roll:** pick a range of the transcript, then `broll-generate.ts` places the result on an overlay track.
- **Edit by transcript:** deleting words in the Captions → Edit transcript ripple-cuts the video (extend `lib/editor/ripple-cut.ts`).
- **Translate all captions** (`lib/caption-translate.ts`) and **Dub the project** (`lib/autoclip-dub.ts`).
- **Upscale clip** (SeedVR), **Remove subtitles**, **Auto-enhance colour** (extend color-match), **Generate image** (Gemini) in the Media panel.
- **Script to video (P3, last in this phase):** script → voiceover (Phase 6) → generated B-roll per sentence → captions → music, built as one v2 doc the user then edits.
- **Media panel uses the shared `AssetPicker`** (`app/components/assets/AssetPicker.tsx`). It keeps the editor's click-to-add, but brings the same filters, folders and tool-result outputs that Caption Studio and Photo Edit already have. This retires the separate `MediaPanel` asset code.
- **AI copilot:**
  - Expose editor actions (add captions, add music, remove silences, apply template, reframe, generate B-roll) as typed commands.
  - Ctrl+K accepts natural language, Gemini maps it to a command plan, and the user confirms before it applies.
  - All of it runs through store actions, so it can be undone.

### Phase 8: Export, templates, polish
- Export options: MP4/MOV/WebM/GIF, audio-only MP3/WAV, fps, bitrate (low/med/high), in-out range, burned-in vs SRT/VTT/TXT captions, upscale on export.
- Project templates: a gallery on `EmptyProjectStart` (hook text + caption template + music + layout). Store them as v2 docs with placeholder clips.
- Performance:
  - Proxy previews for 4K or long sources.
  - Filmstrip and waveform caches.
  - Virtualise all tracks the way the caption track already is.
  - Faster render: revisit `-threads 1`, which was a crash fix. Use a capped thread count tied to the plan's CPU caps (#395), not one thread.
- A11y and keyboard pass. Update `docs/DESIGN_SYSTEM.md` with the new editor sections.

### Phase 9: Pro tier (Resolve-flavoured)
- **Motion tracking:**
  - Select a region on the canvas, then track it in a worker, reusing the AutoClip tracker (`lib/autoclip-ai/face-detect-*`, `camera-path.ts`) for faces and OpenCV.js template/KLT tracking for any object.
  - The track writes position (and optionally scale) keyframes onto text, sticker or mask clips ("Pin to object").
  - Masks can follow a track (tracked power windows).
- **Colour scopes + pro grading:**
  - A Colour workspace tab with waveform, RGB parade, vectorscope and histogram, computed on the GPU from the engine's frame.
  - Colour wheels (lift, gamma, gain, offset).
  - Grade layers in sequence ("nodes lite": a stack you can reorder, each with an optional mask).
  - Copy grade / apply to all, and save grade as a LUT.
  - Export: 10-bit HEVC/ProRes and an HDR (PQ/HLG) flag, Agency-plan only. Preview stays SDR, with a warning.
- **Multicam:**
  - Select 2–4 clips, then "Create multicam". Sync by audio cross-correlation in a worker, or by timecode.
  - Viewer grid of the angles; press 1–4 while playing to cut.
  - Stored as a `multicam` clip with angle switches. Export flattens it into the normal per-track graph.
- **Pro export and exchange:**
  - ProRes 422 HQ / 4444 (alpha), DNxHR, PNG sequence.
  - Export FCPXML / EDL / OTIO so Premiere and Resolve can pick the project up.
  - Import OTIO/EDL as a v2 doc.
  - Proxy workflow: auto-generate 540p proxies for 4K sources; the engine plays proxies and the export uses the originals.

### Suggested order and size
- Phase 0 (days) → 1 (1–2 weeks) → 2 + 3 (2 weeks, side by side once v2 lands) → 4 (2 weeks).
- 5, 6 and 7 can then run in parallel, since they touch separate panels and routes.
- 8 follows them.
- Phase 9 comes after 8: multicam and export can start once v2 lands; scopes and tracking need the GPU engine from Phase 3.
- **Expected result:**
  - After Phase 8: CapCut-grade for short-form, with more AI built in.
  - After Phase 9: Resolve-flavoured pro tools (scopes, tracking, multicam, ProRes/XML).
  - Still not Resolve itself: no Fusion node compositing, no Fairlight bus mixing, no frame-accurate 8K finishing in a browser.
- Phase 1 is the hard dependency: nothing in 2–7 should start before the v2 model merges.

## Coverage check: every gap in Part A has a home
- **A1 Timeline:**
  - Tracks, layers, multi-select, split, track controls → P1/P2.
  - Ripple editing, markers, groups, freeze/reverse/replace, keyframes, transition length → P2.
  - Slip/slide/roll → P2. Main-track magnet → P1.
  - Speed curves → P4. Right-click menu → P0. Clip cap and fps → P1.
- **A2 Preview:** handles, guides, safe zones, full screen/zoom/quality, loop/JKL, canvas background → P3. Audio mix and image fade bugs → P0.
- **A3 Properties panel:**
  - Video, image and text sections, plus stabilise → P4.
  - Audio tabs, loop and speed/pitch → P4. Denoise and voice effects → P6.
  - Text and caption export gaps, the wrong badge, speaker labels → P4/P0.
  - Translate all → P7. Curved/bubble text and saved styles → P5.
- **A4 Effects:** filters, LUTs, effects, transitions, stickers/emoji, SFX library, text templates → P5. HSL/curves/animations → P4. Auto colour → P7. Project templates → P8.
- **A5 Audio:** all → P6. Real mixing in preview → P0/P6.
- **A6 AI:**
  - Background removal, reframe, B-roll, transcript editing, translate, dub, upscale, subtitle removal, auto colour, image generation, copilot, script to video → P7.
  - Voiceover, enhance, voice changer, vocal separation, SFX, music generation, beat sync, forced alignment → P6.
- **A7 Export:** formats, fps, bitrate, range, caption files, upscale → P8. AutoClip double captions → P0.
- **Found during the code read:**
  - Hover toolbar on text only, captions billing for the whole asset, leftover `PanelKind` values → P0.
  - Mixed text styles flattened at export → P4. Ducking on music only → P1.
  - Editor not using AssetPicker → P7. `-threads 1` slow render → P8.

## Files touched most
- `packages/shared/src/editor/timeline.ts`: model, presets, validateDoc, migration.
- `app/dashboard/editor/store/editorStore.ts`, `store/history.ts`, `store/trim.ts`.
- `app/dashboard/editor/components/timeline/*`, `PreviewStage.tsx`, `PreviewControls.tsx`, `hooks/usePlayback.ts`.
- `app/dashboard/editor/components/properties/*`, `tabConfig.tsx`.
- `lib/editor/filtergraph.ts`, `keyframes.ts`, `render-job.ts`, `caption-ass.ts`.
- New routes in `app/api/editor/ai/*`, reusing `app/api/tools/*` services and `lib/autoclip-ai/*`.

## Verification (per phase)
- Unit tests: v1 → v2 migration, store actions (split, ripple, groups), and a filtergraph snapshot per new property.
- A golden-export check: render a fixed test doc, compare frames to the preview (screenshot at t=1s, 3s, 5s) to catch preview/export drift.
- Full local CI (lint, types, vitest, build, e2e), then sign in with Claude in Chrome on the local build and drive the new UI. Screenshot the result before calling it done.
- Prod checks after deploy: old projects open (migration), and export a sample project.

## Deliverable after approval
1. Write `docs/editor/EDITOR_GAP_ANALYSIS.md` (Part A + Part B) on a new branch `docs/editor-roadmap`.
2. Publish it as a private Artifact page (gap tables + phase timeline) and give the link.
3. Then start Phase 0 if the user says go.
