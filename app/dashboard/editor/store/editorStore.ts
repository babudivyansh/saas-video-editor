"use client";

// Zustand store for the browser editor. Holds the persisted TimelineDoc plus
// transient UI/selection/playback state. Mutating actions that should be
// undoable call pushHistory(doc) BEFORE applying the change; drag interactions
// call the *Transient variants per-frame and commit once on pointer-up.

import { create } from "zustand";
import type { AnyClip, Aspect, AudioClip, CaptionClip, FrameRate, ImageClip, Marker, OverlayClip, TextClip, TimelineDoc, TrackKind, TrackState, VideoClip } from "@/lib/editor/types";
import { DEFAULT_DOC, MAX_CAPTION_CLIPS_PER_TRACK, MAX_CLIPS_PER_TRACK, MAX_MARKERS, normalizeDoc } from "@/lib/editor/types";
import { showPanelToast } from "../components/ui/PanelToast";
import {
  closeVideoGap,
  docDuration,
  placeCaptionClip,
  placeVideoClip,
  splitCaptionClip,
  splitFreeClip,
  splitVideoClip,
  trackLocked,
  trimAtPlayhead,
  videoClipAt,
} from "@/lib/editor/doc-utils";
import { emptyHistory, pushHistory, redo, undo, type HistoryState } from "./history";
import { realignWords } from "@/lib/editor/caption-words";
import { rippleCut, type TimeRange } from "@/lib/editor/ripple-cut";
import { constrainTiming, repairOverlaps, TIMING_KEYS, trimPatch } from "./trim";
import { sourceDuration } from "./sourceDurations";

// "conflict" = the server rejected our last save because a newer version (from
// another tab/device) already landed — see app/dashboard/editor/hooks/useAutosave.ts.
// Local edits are intentionally NOT discarded when this happens; the user must
// explicitly choose to reload the server's version (loadProject) or keep
// editing and try saving again (which re-checks and can re-surface conflict).
export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
export type PanelKind =
  | "media"
  | "image"
  | "audio"
  | "video"
  | "text"
  | "caption"
  | "captionEdit"
  | "captionStyle"
  | "textTemplates"
  | "textAi"
  | "myAudio"
  | "sticker"
  | "shape"
  | "effect"
  | "filter"
  | "transition"
  | "ai"
  | "aiCaptions"
  | "aiVideo";

/**
 * The export refuses a track over its clip cap (validateDoc), so adding past
 * it is stopped here with a message instead of failing at export time.
 */
function trackFull(doc: TimelineDoc, track: TrackKind): boolean {
  const cap = track === "caption" ? MAX_CAPTION_CLIPS_PER_TRACK : MAX_CLIPS_PER_TRACK;
  if (doc.tracks[track].length < cap) return false;
  showPanelToast(`The ${track} track is full (${cap} clips). Delete or merge some first.`);
  return true;
}

/** Within this of the end counts as "at the end" (≈ one 30 fps frame). */
const END_EPSILON = 1 / 30;

export interface Selection {
  clipId: string;
  track: TrackKind;
}

const FREE_TRACKS = ["text", "audio", "image", "overlay"] as const;
type FreeTrack = (typeof FREE_TRACKS)[number];
const isFreeTrack = (t: TrackKind): t is FreeTrack => (FREE_TRACKS as readonly string[]).includes(t);

/** Every clip the selection covers: the primary pick, Shift/Ctrl picks, and
 *  the rest of any group one of them belongs to. */
export function selectedClips(doc: TimelineDoc, primary: Selection | null, extra: Selection[]): Selection[] {
  const picks = [...(primary ? [primary] : []), ...extra];
  const groupIds = new Set<string>();
  const out = new Map<string, Selection>();
  for (const p of picks) {
    const clip = (doc.tracks[p.track] as AnyClip[] | undefined)?.find((c) => c.id === p.clipId);
    if (!clip) continue;
    out.set(clip.id, p);
    if (clip.groupId) groupIds.add(clip.groupId);
  }
  if (groupIds.size) {
    for (const track of Object.keys(doc.tracks) as TrackKind[]) {
      for (const c of doc.tracks[track] as AnyClip[]) {
        if (c.groupId && groupIds.has(c.groupId) && !out.has(c.id)) out.set(c.id, { clipId: c.id, track });
      }
    }
  }
  return [...out.values()];
}

/** A clip, or its whole track, is locked against edits. */
function isLocked(doc: TimelineDoc, track: TrackKind, clip: AnyClip): boolean {
  return !!clip.locked || trackLocked(doc, track);
}

interface EditorState {
  // Persisted document
  projectId: string | null;
  doc: TimelineDoc;
  history: HistoryState;
  /** Optimistic-concurrency token last confirmed from the server (Project.editorVersion). */
  editorVersion: number;

  // Transient state
  selection: Selection | null;
  /** Shift/Ctrl-clicked clips besides `selection` (Phase 1 multi-select). */
  extraSelection: Selection[];
  clipboard: AnyClip | null;
  playing: boolean;
  currentTime: number; // throttled mirror of the rAF clock (UI text etc.)
  zoom: number; // timeline px per second
  snapEnabled: boolean;
  activePanel: PanelKind;
  exportOpen: boolean;
  /** Ctrl K command bar. */
  paletteOpen: boolean;
  /** Keyboard shortcuts sheet (title menu → Keyboard shortcuts, or ?). */
  shortcutsOpen: boolean;
  historyOpen: boolean;
  /** Properties panel open in overlay (tablet) / full-screen (phone) mode. */
  propertiesOpen: boolean;
  /** Remove silences dialog. */
  silenceOpen: boolean;
  saveState: SaveState;
  focusTextClipId: string | null; // set by "Add Text"/double-click-on-canvas to focus the Lexical editor in the properties panel

  // Lifecycle
  loadProject: (projectId: string, doc: TimelineDoc | null, editorVersion?: number) => void;
  /**
   * Attaches an id to the document already in memory. Unlike loadProject this
   * keeps doc, history and saveState untouched — it exists for the deferred
   * creation path, where the project row is only written once the user makes
   * their first edit and the local document is the source of truth.
   */
  setProjectId: (projectId: string) => void;
  /**
   * Blank, not-yet-persisted document. Used when the editor is opened without
   * a ?projectId — no project row exists until the first edit triggers one.
   */
  resetProject: () => void;
  markSaved: (state: SaveState) => void;
  setEditorVersion: (v: number) => void;

  // Selection / UI
  select: (sel: Selection | null) => void;
  /** Shift/Ctrl-click: adds the clip to the selection, or removes it. */
  toggleSelect: (sel: Selection) => void;
  setActivePanel: (p: PanelKind) => void;
  setZoom: (z: number) => void;
  toggleSnap: () => void;
  setExportOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
  setPropertiesOpen: (open: boolean) => void;
  setSilenceOpen: (open: boolean) => void;
  requestTextFocus: (clipId: string) => void;
  clearTextFocus: () => void;

  // Playback (rAF clock writes through these)
  setPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;

  // Document mutations (undoable)
  /** `size` is required the first time a doc goes "original" (see originalFrame). */
  setAspect: (a: Aspect, size?: { w: number; h: number }) => void;
  addVideoClip: (clip: VideoClip) => void;
  addTextClip: (clip: TextClip) => void;
  addTextClips: (clips: TextClip[]) => void;
  addAudioClip: (clip: AudioClip) => void;
  addImageClip: (clip: ImageClip) => void;
  addCaptionClip: (clip: CaptionClip) => void;
  addCaptionClips: (clips: CaptionClip[], opts?: { replace?: boolean }) => void;
  splitCaptionClip: (atTime: number) => void;
  mergeCaptionClips: (clipIdA: string, clipIdB: string) => void;
  moveCaptionClipTransient: (clipId: string, newStart: number) => void;
  applyCaptionStyle: (patch: Partial<CaptionClip>) => void;
  /** Rewrites every caption's text with `edit` as one undo step, keeping word timings in step. Returns how many changed. */
  applyCaptionTextEdit: (edit: (text: string) => string) => number;
  /** Cuts time ranges out of every track and closes the gaps, as one undo step. */
  rippleCutRanges: (ranges: TimeRange[]) => void;
  /** Copies a filter preset + fine-tune onto every video clip (one undo step). */
  applyVideoLookToAll: (look: { filter?: VideoClip["filter"]; adjust?: VideoClip["adjust"] }) => void;
  /** Sets the same transition on every cut (all video clips but the last). */
  applyTransitionToAllCuts: (t: VideoClip["transitionOut"]) => void;
  updateClip: (track: TrackKind, clipId: string, patch: Record<string, unknown>, undoable?: boolean) => void;
  commitDrag: (before: TimelineDoc) => void;
  moveVideoClipTransient: (clipId: string, newStart: number) => void;
  moveOverlayClipTransient: (track: "text" | "audio" | "image" | "overlay", clipId: string, newStart: number) => void;
  /** `origin` = the clip as it was at pointer-down (see trimPatch). */
  trimClipTransient: (track: TrackKind, clipId: string, edge: "left" | "right", newTime: number, origin?: AnyClip) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  /** Deletes the selected clips and closes the gap on every track (Shift+Delete). */
  rippleDeleteSelected: () => void;
  /** Q / W: removes the part of the selected clip before / after the playhead. */
  trimSelectedAtPlayhead: (removeSide: "left" | "right") => void;
  addOverlayClip: (clip: OverlayClip) => void;
  /** Adds a marker at `t` (default the playhead); toggles it off if one is already there. */
  toggleMarker: (t?: number) => void;
  removeMarker: (id: string) => void;
  setTrackState: (kind: TrackKind, patch: TrackState) => void;
  setFps: (fps: FrameRate) => void;
  setMagnet: (on: boolean) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  copySelected: () => void;
  duplicateSelected: () => void;
  pasteAtPlayhead: () => void;
  undoAction: () => void;
  redoAction: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  doc: structuredClone(DEFAULT_DOC),
  history: emptyHistory(),
  editorVersion: 1,

  selection: null,
  extraSelection: [],
  clipboard: null,
  playing: false,
  currentTime: 0,
  zoom: 60,
  snapEnabled: true,
  activePanel: "media",
  exportOpen: false,
  paletteOpen: false,
  shortcutsOpen: false,
  historyOpen: false,
  propertiesOpen: false,
  silenceOpen: false,
  saveState: "saved",
  focusTextClipId: null,

  loadProject: (projectId, doc, editorVersion) =>
    set({
      projectId,
      // normalizeDoc backfills any track arrays missing from an older saved
      // doc (e.g. one predating the caption track) — every other client
      // reader assumes all five track arrays always exist, so this is the
      // one place that guarantee has to actually be established.
      doc: doc ? repairOverlaps(normalizeDoc(doc)) : structuredClone(DEFAULT_DOC),
      history: emptyHistory(),
      editorVersion: editorVersion ?? 1,
      selection: null,
      extraSelection: [],
      playing: false,
      currentTime: 0,
      saveState: "saved",
      focusTextClipId: null,
    }),

  setProjectId: (projectId) => set({ projectId }),

  resetProject: () =>
    set({
      projectId: null,
      doc: structuredClone(DEFAULT_DOC),
      history: emptyHistory(),
      editorVersion: 1,
      selection: null,
      extraSelection: [],
      playing: false,
      currentTime: 0,
      saveState: "saved",
      focusTextClipId: null,
    }),

  markSaved: (state) => set({ saveState: state }),
  setEditorVersion: (v) => set({ editorVersion: v }),

  select: (sel) => set({ selection: sel, extraSelection: [] }),
  toggleSelect: (sel) =>
    set((s) => {
      if (!s.selection) return { selection: sel, extraSelection: [] };
      if (s.selection.clipId === sel.clipId) {
        // Removing the primary promotes the next pick.
        const [next, ...rest] = s.extraSelection;
        return { selection: next ?? null, extraSelection: rest };
      }
      const has = s.extraSelection.some((e) => e.clipId === sel.clipId);
      return { extraSelection: has ? s.extraSelection.filter((e) => e.clipId !== sel.clipId) : [...s.extraSelection, sel] };
    }),
  setActivePanel: (p) => set({ activePanel: p }),
  setZoom: (z) => set({ zoom: Math.min(300, Math.max(10, z)) }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setExportOpen: (open) => set({ exportOpen: open, paletteOpen: false }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open, paletteOpen: false }),
  setHistoryOpen: (open) => set({ historyOpen: open, paletteOpen: false }),
  setPropertiesOpen: (open) => set({ propertiesOpen: open }),
  setSilenceOpen: (open) => set({ silenceOpen: open, paletteOpen: false }),
  requestTextFocus: (clipId) => set({ focusTextClipId: clipId }),
  clearTextFocus: () => set({ focusTextClipId: null }),

  setPlaying: (p) =>
    set((s) => {
      if (!p) return { playing: false };
      const total = docDuration(s.doc);
      // Nothing to play: stay paused rather than flicker play → pause.
      if (total <= 0) return { playing: false };
      // Play from the end (or within a frame of it) replays from the start.
      return s.currentTime >= total - END_EPSILON ? { playing: true, currentTime: 0 } : { playing: true };
    }),
  // The playhead lives inside [0, end of timeline]: seeking past the last clip
  // (ruler click in the trailing space, → held down, a drag off the end) used
  // to park it on a black frame that Play then stopped at immediately.
  setCurrentTime: (t) =>
    set((s) => ({ currentTime: Math.min(Math.max(0, Number.isFinite(t) ? t : 0), docDuration(s.doc)) })),

  setAspect: (a, size) =>
    set((s) => {
      // An "original" doc without a frame would fail validateDoc on save.
      if (a === "original" && !size && !s.doc.size) return {};
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, aspect: a, ...(a === "original" && size ? { size } : {}) },
        saveState: "dirty",
      };
    }),

  addVideoClip: (clip) =>
    set((s) => trackFull(s.doc, "video") ? s : ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, video: placeVideoClip(s.doc.tracks.video, clip) } },
      selection: { clipId: clip.id, track: "video" },
      saveState: "dirty",
    })),

  addTextClip: (clip) =>
    set((s) => trackFull(s.doc, "text") ? s : ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, text: [...s.doc.tracks.text, clip] } },
      selection: { clipId: clip.id, track: "text" },
      saveState: "dirty",
    })),

  // Batch insert (auto-captions) — one history entry for the whole set.
  addTextClips: (clips) =>
    set((s) => ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, text: [...s.doc.tracks.text, ...clips] } },
      saveState: "dirty",
    })),

  addAudioClip: (clip) =>
    set((s) => trackFull(s.doc, "audio") ? s : ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, audio: [...s.doc.tracks.audio, clip] } },
      selection: { clipId: clip.id, track: "audio" },
      saveState: "dirty",
    })),

  addImageClip: (clip) =>
    set((s) => trackFull(s.doc, "image") ? s : ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, image: [...s.doc.tracks.image, clip] } },
      selection: { clipId: clip.id, track: "image" },
      saveState: "dirty",
    })),

  addOverlayClip: (clip) =>
    set((s) => trackFull(s.doc, "overlay") ? s : ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, overlay: [...s.doc.tracks.overlay, clip] } },
      selection: { clipId: clip.id, track: "overlay" },
      extraSelection: [],
      saveState: "dirty",
    })),

  addCaptionClip: (clip) =>
    set((s) => trackFull(s.doc, "caption") ? s : ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, caption: placeCaptionClip(s.doc.tracks.caption, clip) } },
      selection: { clipId: clip.id, track: "caption" },
      saveState: "dirty",
    })),

  // Batch insert (whole-timeline generation) — one history entry for the
  // whole set, mirrors addTextClips. Generation-time cues are trusted
  // pre-sorted/non-overlapping (derived from the non-overlapping video
  // track), so this is a simple concat+sort, not routed through
  // placeCaptionClip. opts.replace clears existing captions first (Regenerate).
  addCaptionClips: (clips, opts) =>
    set((s) => {
      const merged = opts?.replace ? clips : [...s.doc.tracks.caption, ...clips];
      const caption = [...merged].sort((a, b) => a.timelineStart - b.timelineStart);
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, caption } },
        saveState: "dirty",
      };
    }),

  splitCaptionClip: (atTime) =>
    set((s) => {
      const clip = s.doc.tracks.caption.find(
        (c) => atTime >= c.timelineStart && atTime < c.timelineStart + c.duration,
      );
      if (!clip || trackFull(s.doc, "caption")) return s;
      const parts = splitCaptionClip(clip, atTime, crypto.randomUUID());
      if (!parts) return s;
      const caption = s.doc.tracks.caption
        .flatMap((c) => (c.id === clip.id ? parts : [c]))
        .sort((a, b) => a.timelineStart - b.timelineStart);
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, caption } },
        selection: { clipId: parts[1].id, track: "caption" },
        saveState: "dirty",
      };
    }),

  mergeCaptionClips: (clipIdA, clipIdB) =>
    set((s) => {
      const list = s.doc.tracks.caption;
      const a = list.find((c) => c.id === clipIdA);
      const b = list.find((c) => c.id === clipIdB);
      if (!a || !b) return s;
      const [earlier, later] = a.timelineStart <= b.timelineStart ? [a, b] : [b, a];
      const laterOffsetMs = (later.timelineStart - earlier.timelineStart) * 1000;
      const words =
        earlier.words || later.words
          ? [...(earlier.words ?? []), ...(later.words ?? []).map((w) => ({ ...w, startMs: w.startMs + laterOffsetMs, endMs: w.endMs + laterOffsetMs }))]
          : undefined;
      const merged: CaptionClip = {
        ...earlier,
        duration: later.timelineStart + later.duration - earlier.timelineStart,
        text: [earlier.text, later.text].filter(Boolean).join(" "),
        words,
      };
      const caption = list.filter((c) => c.id !== earlier.id && c.id !== later.id).concat(merged).sort((x, y) => x.timelineStart - y.timelineStart);
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, caption } },
        selection: { clipId: merged.id, track: "caption" },
        saveState: "dirty",
      };
    }),

  moveCaptionClipTransient: (clipId, newStart) =>
    set((s) => {
      const clip = s.doc.tracks.caption.find((c) => c.id === clipId);
      if (!clip) return s;
      const moved = { ...clip, timelineStart: Math.max(0, newStart) };
      return { doc: { ...s.doc, tracks: { ...s.doc.tracks, caption: placeCaptionClip(s.doc.tracks.caption, moved) } } };
    }),

  // Batch-patches every caption clip (e.g. applying a template to the whole
  // track when nothing is selected) — one history entry, mirrors addTextClips'
  // batch convention.
  applyCaptionStyle: (patch) =>
    set((s) => ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, caption: s.doc.tracks.caption.map((c) => ({ ...c, ...patch })) } },
      saveState: "dirty",
    })),

  applyCaptionTextEdit: (edit) => {
    const s = get();
    let changed = 0;
    const caption = s.doc.tracks.caption.map((c) => {
      const text = edit(c.text);
      if (text === c.text) return c;
      changed++;
      return { ...c, text, words: realignWords(c.words, text) };
    });
    if (changed > 0) {
      set({ history: pushHistory(s.history, s.doc), doc: { ...s.doc, tracks: { ...s.doc.tracks, caption } }, saveState: "dirty" });
    }
    return changed;
  },

  applyVideoLookToAll: (look) => {
    const s = get();
    set({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, video: s.doc.tracks.video.map((c) => ({ ...c, filter: look.filter, adjust: look.adjust })) } },
      saveState: "dirty",
    });
  },

  applyTransitionToAllCuts: (t) => {
    const s = get();
    const last = s.doc.tracks.video.length - 1;
    set({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, video: s.doc.tracks.video.map((c, i) => (i < last ? { ...c, transitionOut: t } : c)) } },
      saveState: "dirty",
    });
  },

  rippleCutRanges: (ranges) => {
    const s = get();
    if (ranges.length === 0) return;
    set({
      history: pushHistory(s.history, s.doc),
      doc: rippleCut(s.doc, ranges, () => crypto.randomUUID()),
      selection: null,
      extraSelection: [],
      saveState: "dirty",
    });
  },

  updateClip: (track, clipId, patch, undoable = true) =>
    set((s) => {
      const list = s.doc.tracks[track] as AnyClip[];
      const prev = list.find((c) => c.id === clipId);
      if (!prev) return s;
      let next = { ...prev, ...patch } as AnyClip;
      let nextTrack: AnyClip[] = list.map((c) => (c.id === clipId ? next : c));
      if (TIMING_KEYS.some((k) => k in patch)) {
        const len = next.type === "video" || next.type === "audio" ? sourceDuration(next.assetId) : undefined;
        next = constrainTiming(track, prev, next, list, len);
        nextTrack =
          track === "video" ? placeVideoClip(list as VideoClip[], next as VideoClip) :
          track === "caption" ? placeCaptionClip(list as CaptionClip[], next as CaptionClip) :
          list.map((c) => (c.id === clipId ? next : c));
      }
      return {
        history: undoable ? pushHistory(s.history, s.doc) : s.history,
        doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: nextTrack } },
        saveState: "dirty",
      };
    }),

  // Drag lifecycle: caller snapshots the doc on pointer-down, mutates with the
  // *Transient actions per-frame, then calls commitDrag(snapshot) on pointer-up
  // so the whole gesture is a single undo step.
  commitDrag: (before) =>
    set((s) => ({ history: pushHistory(s.history, before), saveState: "dirty" })),

  moveVideoClipTransient: (clipId, newStart) =>
    set((s) => {
      const clip = s.doc.tracks.video.find((c) => c.id === clipId);
      if (!clip) return s;
      const moved = { ...clip, timelineStart: Math.max(0, newStart) };
      return { doc: { ...s.doc, tracks: { ...s.doc.tracks, video: placeVideoClip(s.doc.tracks.video, moved) } } };
    }),

  moveOverlayClipTransient: (track, clipId, newStart) =>
    set((s) => {
      const list = s.doc.tracks[track] as (TextClip | AudioClip)[];
      const nextTrack = list.map((c) => (c.id === clipId ? { ...c, timelineStart: Math.max(0, newStart) } : c));
      return { doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: nextTrack } } };
    }),

  trimClipTransient: (track, clipId, edge, newTime, origin) =>
    set((s) => {
      const list = s.doc.tracks[track] as AnyClip[];
      const current = list.find((c) => c.id === clipId);
      if (!current) return s;
      // Computed from the clip as it was when the drag began (when given), so
      // anything a trim drops (caption words, keyframes) comes back if the
      // edge is dragged back within the same gesture.
      const clip = origin && origin.id === clipId ? origin : current;
      const len = "assetId" in clip && (clip.type === "video" || clip.type === "audio") ? sourceDuration(clip.assetId) : undefined;
      const patch = trimPatch(track, clip, list, edge, newTime, len);
      const nextTrack = list.map((c) => (c.id === clipId ? { ...c, ...patch } : c));
      return { doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: nextTrack } } };
    }),

  splitAtPlayhead: () => {
    const s0 = get();
    // A selected caption cue delegates to the caption-specific split (needs
    // words[]-aware partitioning splitVideoClip can't do) — the existing "S"
    // shortcut/toolbar button works for both without a second control. Every
    // other selection state falls through to the unchanged video-only body below.
    if (s0.selection?.track === "caption") {
      get().splitCaptionClip(s0.currentTime);
      return;
    }
    // Text, image, audio and overlay clips split too (Phase 1).
    const freeSel = s0.selection;
    if (freeSel && isFreeTrack(freeSel.track)) {
      const track = freeSel.track;
      set((s) => {
        const list = s.doc.tracks[track] as (TextClip | ImageClip | AudioClip | OverlayClip)[];
        const clip = list.find((c) => c.id === freeSel.clipId);
        if (!clip || isLocked(s.doc, track, clip) || trackFull(s.doc, track)) return s;
        const parts = splitFreeClip(clip, s.currentTime, crypto.randomUUID());
        if (!parts) return s;
        return {
          history: pushHistory(s.history, s.doc),
          doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: list.flatMap((c) => (c.id === clip.id ? parts : [c])) } },
          selection: { clipId: parts[1].id, track },
          extraSelection: [],
          saveState: "dirty",
        };
      });
      return;
    }
    set((s) => {
      const t = s.currentTime;
      const clip = videoClipAt(s.doc, t);
      if (!clip || trackFull(s.doc, "video")) return s;
      const parts = splitVideoClip(clip, t, crypto.randomUUID());
      if (!parts) return s;
      const video = s.doc.tracks.video
        .flatMap((c) => (c.id === clip.id ? parts : [c]))
        .sort((a, b) => a.timelineStart - b.timelineStart);
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, video } },
        selection: { clipId: parts[1].id, track: "video" },
        saveState: "dirty",
      };
    });
  },

  deleteSelected: () =>
    set((s) => {
      const picks = selectedClips(s.doc, s.selection, s.extraSelection);
      if (picks.length === 0) return s;
      const tracks = { ...s.doc.tracks } as Record<TrackKind, AnyClip[]>;
      let removed = 0;
      // Main-lane spans removed, latest first, for the magnet.
      const videoGaps: { start: number; length: number }[] = [];
      for (const { clipId, track } of picks) {
        const list = tracks[track];
        const target = list.find((c) => c.id === clipId);
        // Locked = protected from edits; Delete/Backspace used to remove it anyway.
        if (!target || isLocked(s.doc, track, target)) continue;
        tracks[track] = list.filter((c) => c.id !== clipId);
        removed++;
        if (track === "video") videoGaps.push({ start: target.timelineStart, length: target.duration });
      }
      if (removed === 0) return s;
      if (s.doc.magnet) {
        let video = tracks.video as VideoClip[];
        for (const g of videoGaps.sort((a, b) => b.start - a.start)) video = closeVideoGap(video, g.start, g.length);
        tracks.video = video;
      }
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: tracks as TimelineDoc["tracks"] },
        selection: null,
        extraSelection: [],
        saveState: "dirty",
      };
    }),

  rippleDeleteSelected: () => {
    const s = get();
    const picks = selectedClips(s.doc, s.selection, s.extraSelection);
    const ranges: TimeRange[] = [];
    for (const { clipId, track } of picks) {
      const clip = (s.doc.tracks[track] as AnyClip[]).find((c) => c.id === clipId);
      if (!clip || isLocked(s.doc, track, clip)) continue;
      ranges.push({ start: clip.timelineStart, end: clip.timelineStart + clip.duration });
    }
    if (ranges.length === 0) return;
    // A ripple cut removes the span from every track and closes it.
    get().rippleCutRanges(ranges);
    set({ selection: null, extraSelection: [] });
  },

  trimSelectedAtPlayhead: (removeSide) =>
    set((s) => {
      if (!s.selection) return s;
      const { clipId, track } = s.selection;
      const list = s.doc.tracks[track] as AnyClip[];
      const clip = list.find((c) => c.id === clipId);
      if (!clip || isLocked(s.doc, track, clip)) return s;
      const next = trimAtPlayhead(clip, s.currentTime, removeSide);
      if (!next) return s;
      let nextTrack = list.map((c) => (c.id === clipId ? next : c));
      // With the magnet on, the main lane closes what Q opened up.
      if (track === "video" && s.doc.magnet) {
        const removed = clip.duration - next.duration;
        if (removeSide === "left") {
          nextTrack = (nextTrack as VideoClip[]).map((c) =>
            c.id === clipId ? { ...c, timelineStart: clip.timelineStart } : c.timelineStart > clip.timelineStart ? { ...c, timelineStart: Math.max(0, c.timelineStart - removed) } : c,
          );
        } else {
          nextTrack = closeVideoGap(nextTrack as VideoClip[], clip.timelineStart + clip.duration, removed);
        }
      }
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: nextTrack } },
        saveState: "dirty",
      };
    }),

  toggleMarker: (t) =>
    set((s) => {
      const at = t ?? s.currentTime;
      const markers = s.doc.markers ?? [];
      // Within a frame of an existing marker = remove it (M toggles).
      const hit = markers.find((m) => Math.abs(m.t - at) < 1 / 30);
      let next: Marker[];
      if (hit) next = markers.filter((m) => m.id !== hit.id);
      else if (markers.length >= MAX_MARKERS) {
        showPanelToast(`Up to ${MAX_MARKERS} markers.`);
        return s;
      } else next = [...markers, { id: crypto.randomUUID(), t: at }].sort((a, b) => a.t - b.t);
      return { history: pushHistory(s.history, s.doc), doc: { ...s.doc, markers: next }, saveState: "dirty" };
    }),

  removeMarker: (id) =>
    set((s) => ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, markers: (s.doc.markers ?? []).filter((m) => m.id !== id) },
      saveState: "dirty",
    })),

  setTrackState: (kind, patch) =>
    set((s) => {
      const prev = s.doc.trackState?.[kind] ?? {};
      const merged = { ...prev, ...patch };
      // Off is the default: drop false flags so docs stay small.
      const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v)) as TrackState;
      const trackState = { ...(s.doc.trackState ?? {}), [kind]: clean };
      if (Object.keys(clean).length === 0) delete trackState[kind];
      return { history: pushHistory(s.history, s.doc), doc: { ...s.doc, trackState }, saveState: "dirty" };
    }),

  setFps: (fps) =>
    set((s) => (s.doc.fps === fps ? s : { history: pushHistory(s.history, s.doc), doc: { ...s.doc, fps }, saveState: "dirty" })),

  setMagnet: (on) =>
    set((s) => ({ history: pushHistory(s.history, s.doc), doc: { ...s.doc, magnet: on }, saveState: "dirty" })),

  groupSelected: () =>
    set((s) => {
      const picks = selectedClips(s.doc, s.selection, s.extraSelection);
      if (picks.length < 2) {
        showPanelToast("Shift-click two or more clips to group them.");
        return s;
      }
      const groupId = crypto.randomUUID();
      const ids = new Set(picks.map((p) => p.clipId));
      const tracks = Object.fromEntries(
        Object.entries(s.doc.tracks).map(([k, list]) => [k, (list as AnyClip[]).map((c) => (ids.has(c.id) ? { ...c, groupId } : c))]),
      ) as TimelineDoc["tracks"];
      return { history: pushHistory(s.history, s.doc), doc: { ...s.doc, tracks }, saveState: "dirty" };
    }),

  ungroupSelected: () =>
    set((s) => {
      const picks = selectedClips(s.doc, s.selection, s.extraSelection);
      const ids = new Set(picks.map((p) => p.clipId));
      let changed = false;
      const tracks = Object.fromEntries(
        Object.entries(s.doc.tracks).map(([k, list]) => [
          k,
          (list as AnyClip[]).map((c) => {
            if (!ids.has(c.id) || !c.groupId) return c;
            changed = true;
            const { groupId: _g, ...rest } = c;
            return rest as AnyClip;
          }),
        ]),
      ) as TimelineDoc["tracks"];
      return changed ? { history: pushHistory(s.history, s.doc), doc: { ...s.doc, tracks }, saveState: "dirty" } : s;
    }),

  copySelected: () =>
    set((s) => {
      if (!s.selection) return s;
      const list = s.doc.tracks[s.selection.track] as AnyClip[];
      const clip = list.find((c) => c.id === s.selection!.clipId);
      return clip ? { clipboard: structuredClone(clip) } : s;
    }),

  duplicateSelected: () =>
    set((s) => {
      if (!s.selection) return s;
      const track = s.selection.track;
      const list = s.doc.tracks[track] as AnyClip[];
      const clip = list.find((c) => c.id === s.selection!.clipId);
      if (!clip || trackFull(s.doc, track)) return s;
      const copy = { ...structuredClone(clip), id: crypto.randomUUID(), timelineStart: clip.timelineStart + clip.duration };
      if (track === "video") {
        const video = placeVideoClip(s.doc.tracks.video, copy as VideoClip);
        return {
          history: pushHistory(s.history, s.doc),
          doc: { ...s.doc, tracks: { ...s.doc.tracks, video } },
          selection: { clipId: copy.id, track: "video" },
          saveState: "dirty",
        };
      }
      if (track === "caption") {
        const caption = placeCaptionClip(s.doc.tracks.caption, copy as CaptionClip);
        return {
          history: pushHistory(s.history, s.doc),
          doc: { ...s.doc, tracks: { ...s.doc.tracks, caption } },
          selection: { clipId: copy.id, track: "caption" },
          saveState: "dirty",
        };
      }
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: [...list, copy] } },
        selection: { clipId: copy.id, track },
        saveState: "dirty",
      };
    }),

  pasteAtPlayhead: () =>
    set((s) => {
      if (!s.clipboard) return s;
      const track =
        s.clipboard.type === "video" ? "video" :
        s.clipboard.type === "text" ? "text" :
        s.clipboard.type === "image" ? "image" :
        s.clipboard.type === "caption" ? "caption" :
        s.clipboard.type === "overlay" ? "overlay" : "audio";
      if (trackFull(s.doc, track)) return s;
      const copy = { ...structuredClone(s.clipboard), id: crypto.randomUUID(), timelineStart: s.currentTime };
      if (track === "video") {
        const video = placeVideoClip(s.doc.tracks.video, copy as VideoClip);
        return {
          history: pushHistory(s.history, s.doc),
          doc: { ...s.doc, tracks: { ...s.doc.tracks, video } },
          selection: { clipId: copy.id, track: "video" },
          saveState: "dirty",
        };
      }
      if (track === "caption") {
        const caption = placeCaptionClip(s.doc.tracks.caption, copy as CaptionClip);
        return {
          history: pushHistory(s.history, s.doc),
          doc: { ...s.doc, tracks: { ...s.doc.tracks, caption } },
          selection: { clipId: copy.id, track: "caption" },
          saveState: "dirty",
        };
      }
      const list = s.doc.tracks[track] as AnyClip[];
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: [...list, copy] } },
        selection: { clipId: copy.id, track },
        saveState: "dirty",
      };
    }),

  undoAction: () => {
    const s = get();
    const result = undo(s.history, s.doc);
    if (result) set({ history: result.history, doc: result.doc, selection: null, extraSelection: [], saveState: "dirty" });
  },

  redoAction: () => {
    const s = get();
    const result = redo(s.history, s.doc);
    if (result) set({ history: result.history, doc: result.doc, selection: null, extraSelection: [], saveState: "dirty" });
  },
}));
