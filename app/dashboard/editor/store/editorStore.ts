"use client";

// Zustand store for the browser editor. Holds the persisted TimelineDoc plus
// transient UI/selection/playback state. Mutating actions that should be
// undoable call pushHistory(doc) BEFORE applying the change; drag interactions
// call the *Transient variants per-frame and commit once on pointer-up.

import { create } from "zustand";
import type { AnyClip, Aspect, AudioClip, CaptionClip, ImageClip, TextClip, TimelineDoc, TrackKind, VideoClip } from "@/lib/editor/types";
import { DEFAULT_DOC, MIN_CLIP_DURATION, normalizeDoc } from "@/lib/editor/types";
import { placeCaptionClip, placeVideoClip, splitCaptionClip, splitVideoClip, videoClipAt } from "@/lib/editor/doc-utils";
import { emptyHistory, pushHistory, redo, undo, type HistoryState } from "./history";

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type PanelKind =
  | "media"
  | "image"
  | "audio"
  | "video"
  | "text"
  | "caption"
  | "sticker"
  | "effect"
  | "filter"
  | "transition"
  | "keyboard";

export interface Selection {
  clipId: string;
  track: TrackKind;
}

interface EditorState {
  // Persisted document
  projectId: string | null;
  doc: TimelineDoc;
  history: HistoryState;

  // Transient state
  selection: Selection | null;
  clipboard: AnyClip | null;
  playing: boolean;
  currentTime: number; // throttled mirror of the rAF clock (UI text etc.)
  zoom: number; // timeline px per second
  snapEnabled: boolean;
  activePanel: PanelKind;
  exportOpen: boolean;
  saveState: SaveState;
  focusTextClipId: string | null; // set by "Add Text"/double-click-on-canvas to focus the Lexical editor in the properties panel

  // Lifecycle
  loadProject: (projectId: string, doc: TimelineDoc | null) => void;
  markSaved: (state: SaveState) => void;

  // Selection / UI
  select: (sel: Selection | null) => void;
  setActivePanel: (p: PanelKind) => void;
  setZoom: (z: number) => void;
  toggleSnap: () => void;
  setExportOpen: (open: boolean) => void;
  requestTextFocus: (clipId: string) => void;
  clearTextFocus: () => void;

  // Playback (rAF clock writes through these)
  setPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;

  // Document mutations (undoable)
  setAspect: (a: Aspect) => void;
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
  updateClip: (track: TrackKind, clipId: string, patch: Record<string, unknown>, undoable?: boolean) => void;
  commitDrag: (before: TimelineDoc) => void;
  moveVideoClipTransient: (clipId: string, newStart: number) => void;
  moveOverlayClipTransient: (track: "text" | "audio" | "image", clipId: string, newStart: number) => void;
  trimClipTransient: (track: TrackKind, clipId: string, edge: "left" | "right", newTime: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
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

  selection: null,
  clipboard: null,
  playing: false,
  currentTime: 0,
  zoom: 60,
  snapEnabled: true,
  activePanel: "media",
  exportOpen: false,
  saveState: "saved",
  focusTextClipId: null,

  loadProject: (projectId, doc) =>
    set({
      projectId,
      // normalizeDoc backfills any track arrays missing from an older saved
      // doc (e.g. one predating the caption track) — every other client
      // reader assumes all five track arrays always exist, so this is the
      // one place that guarantee has to actually be established.
      doc: doc ? normalizeDoc(doc) : structuredClone(DEFAULT_DOC),
      history: emptyHistory(),
      selection: null,
      playing: false,
      currentTime: 0,
      saveState: "saved",
      focusTextClipId: null,
    }),

  markSaved: (state) => set({ saveState: state }),

  select: (sel) => set({ selection: sel }),
  setActivePanel: (p) => set({ activePanel: p }),
  setZoom: (z) => set({ zoom: Math.min(300, Math.max(10, z)) }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setExportOpen: (open) => set({ exportOpen: open }),
  requestTextFocus: (clipId) => set({ focusTextClipId: clipId }),
  clearTextFocus: () => set({ focusTextClipId: null }),

  setPlaying: (p) => set({ playing: p }),
  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),

  setAspect: (a) =>
    set((s) => ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, aspect: a },
      saveState: "dirty",
    })),

  addVideoClip: (clip) =>
    set((s) => ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, video: placeVideoClip(s.doc.tracks.video, clip) } },
      selection: { clipId: clip.id, track: "video" },
      saveState: "dirty",
    })),

  addTextClip: (clip) =>
    set((s) => ({
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
    set((s) => ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, audio: [...s.doc.tracks.audio, clip] } },
      selection: { clipId: clip.id, track: "audio" },
      saveState: "dirty",
    })),

  addImageClip: (clip) =>
    set((s) => ({
      history: pushHistory(s.history, s.doc),
      doc: { ...s.doc, tracks: { ...s.doc.tracks, image: [...s.doc.tracks.image, clip] } },
      selection: { clipId: clip.id, track: "image" },
      saveState: "dirty",
    })),

  addCaptionClip: (clip) =>
    set((s) => ({
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
      if (!clip) return s;
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

  updateClip: (track, clipId, patch, undoable = true) =>
    set((s) => {
      const list = s.doc.tracks[track] as { id: string }[];
      if (!list.some((c) => c.id === clipId)) return s;
      const nextTrack = list.map((c) => (c.id === clipId ? { ...c, ...patch } : c));
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

  trimClipTransient: (track, clipId, edge, newTime) =>
    set((s) => {
      const list = s.doc.tracks[track] as (VideoClip | TextClip | AudioClip | CaptionClip)[];
      const clip = list.find((c) => c.id === clipId);
      if (!clip) return s;
      const end = clip.timelineStart + clip.duration;
      let patch: Partial<VideoClip> = {};
      if (edge === "left") {
        const newStart = Math.min(Math.max(0, newTime), end - MIN_CLIP_DURATION);
        const delta = newStart - clip.timelineStart;
        patch = { timelineStart: newStart, duration: end - newStart };
        // Video/audio trims also advance into the source so content stays put
        // (scaled by playback speed for video clips). Text/image clips have
        // no srcIn — they're just repositioned/resized on the timeline.
        if (track === "video" || track === "audio") {
          const speed = track === "video" ? ((clip as VideoClip).speed ?? 1) : 1;
          (patch as VideoClip).srcIn = Math.max(0, (clip as VideoClip).srcIn + delta * speed);
        }
      } else {
        const newEnd = Math.max(newTime, clip.timelineStart + MIN_CLIP_DURATION);
        patch = { duration: newEnd - clip.timelineStart };
      }
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
    set((s) => {
      const t = s.currentTime;
      const clip = videoClipAt(s.doc, t);
      if (!clip) return s;
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
      if (!s.selection) return s;
      const { clipId, track } = s.selection;
      const list = s.doc.tracks[track] as { id: string }[];
      if (!list.some((c) => c.id === clipId)) return s;
      const nextTrack = list.filter((c) => c.id !== clipId);
      return {
        history: pushHistory(s.history, s.doc),
        doc: { ...s.doc, tracks: { ...s.doc.tracks, [track]: nextTrack } },
        selection: null,
        saveState: "dirty",
      };
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
      if (!clip) return s;
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
        s.clipboard.type === "caption" ? "caption" : "audio";
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
    if (result) set({ history: result.history, doc: result.doc, selection: null, saveState: "dirty" });
  },

  redoAction: () => {
    const s = get();
    const result = redo(s.history, s.doc);
    if (result) set({ history: result.history, doc: result.doc, selection: null, saveState: "dirty" });
  },
}));
