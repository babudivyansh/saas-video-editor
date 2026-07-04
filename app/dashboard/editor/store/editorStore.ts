"use client";

// Zustand store for the browser editor. Holds the persisted TimelineDoc plus
// transient UI/selection/playback state. Mutating actions that should be
// undoable call pushHistory(doc) BEFORE applying the change; drag interactions
// call the *Transient variants per-frame and commit once on pointer-up.

import { create } from "zustand";
import type { Aspect, AudioClip, TextClip, TimelineDoc, TrackKind, VideoClip } from "@/lib/editor/types";
import { DEFAULT_DOC, MIN_CLIP_DURATION } from "@/lib/editor/types";
import { placeVideoClip, splitVideoClip, videoClipAt } from "@/lib/editor/doc-utils";
import { emptyHistory, pushHistory, redo, undo, type HistoryState } from "./history";

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type PanelKind = "media" | "text" | "audio";

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
  playing: boolean;
  currentTime: number; // throttled mirror of the rAF clock (UI text etc.)
  zoom: number; // timeline px per second
  snapEnabled: boolean;
  activePanel: PanelKind;
  exportOpen: boolean;
  saveState: SaveState;

  // Lifecycle
  loadProject: (projectId: string, doc: TimelineDoc | null) => void;
  markSaved: (state: SaveState) => void;

  // Selection / UI
  select: (sel: Selection | null) => void;
  setActivePanel: (p: PanelKind) => void;
  setZoom: (z: number) => void;
  toggleSnap: () => void;
  setExportOpen: (open: boolean) => void;

  // Playback (rAF clock writes through these)
  setPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;

  // Document mutations (undoable)
  setAspect: (a: Aspect) => void;
  addVideoClip: (clip: VideoClip) => void;
  addTextClip: (clip: TextClip) => void;
  addTextClips: (clips: TextClip[]) => void;
  addAudioClip: (clip: AudioClip) => void;
  updateClip: (track: TrackKind, clipId: string, patch: Record<string, unknown>, undoable?: boolean) => void;
  commitDrag: (before: TimelineDoc) => void;
  moveVideoClipTransient: (clipId: string, newStart: number) => void;
  moveOverlayClipTransient: (track: "text" | "audio", clipId: string, newStart: number) => void;
  trimClipTransient: (track: TrackKind, clipId: string, edge: "left" | "right", newTime: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  undoAction: () => void;
  redoAction: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  doc: structuredClone(DEFAULT_DOC),
  history: emptyHistory(),

  selection: null,
  playing: false,
  currentTime: 0,
  zoom: 60,
  snapEnabled: true,
  activePanel: "media",
  exportOpen: false,
  saveState: "saved",

  loadProject: (projectId, doc) =>
    set({
      projectId,
      doc: doc ?? structuredClone(DEFAULT_DOC),
      history: emptyHistory(),
      selection: null,
      playing: false,
      currentTime: 0,
      saveState: "saved",
    }),

  markSaved: (state) => set({ saveState: state }),

  select: (sel) => set({ selection: sel }),
  setActivePanel: (p) => set({ activePanel: p }),
  setZoom: (z) => set({ zoom: Math.min(300, Math.max(10, z)) }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setExportOpen: (open) => set({ exportOpen: open }),

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
      const list = s.doc.tracks[track] as (VideoClip | TextClip | AudioClip)[];
      const clip = list.find((c) => c.id === clipId);
      if (!clip) return s;
      const end = clip.timelineStart + clip.duration;
      let patch: Partial<VideoClip> = {};
      if (edge === "left") {
        const newStart = Math.min(Math.max(0, newTime), end - MIN_CLIP_DURATION);
        const delta = newStart - clip.timelineStart;
        patch = { timelineStart: newStart, duration: end - newStart };
        // Video/audio trims also advance into the source so content stays put
        // (scaled by playback speed for video clips).
        if (track !== "text") {
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

  splitAtPlayhead: () =>
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
    }),

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
