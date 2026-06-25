import { create } from "zustand";
import {
  TrackDoc,
  Track,
  Clip,
  ClipData,
  Marker,
  TrackAspect,
  TrackKind,
  SidebarTab,
  SaveStatus,
  uid,
  emptyTrackDoc,
  findClip,
  computeDuration,
} from "@/lib/track-editor-types";
import { removeTimeRanges } from "@/lib/transcript-edit";

const MAX_HISTORY = 50;

interface EditorState {
  // ── History ──────────────────────────────────────────────────────────────
  past: TrackDoc[];
  present: TrackDoc;
  future: TrackDoc[];

  // ── Playback ─────────────────────────────────────────────────────────────
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  volume: number;
  duration: number;

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedClipId: string | null;
  selectedTrackId: string | null;

  // ── Timeline UI ──────────────────────────────────────────────────────────
  zoom: number;            // pixels per second (default 80)
  timelineScrollX: number;
  snapEnabled: boolean;

  // ── Sidebar ──────────────────────────────────────────────────────────────
  activeSidebarTab: SidebarTab;

  // ── AI panels ────────────────────────────────────────────────────────────
  aiCopilotOpen: boolean;
  captionStudioOpen: boolean;
  reelsOptimizerOpen: boolean;
  autoEditOpen: boolean;
  smartReframeOpen: boolean;

  // ── Export ───────────────────────────────────────────────────────────────
  exportModalOpen: boolean;

  // ── Project meta ─────────────────────────────────────────────────────────
  projectId: string;
  projectName: string;
  saveStatus: SaveStatus;

  // ── Actions: history ─────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;

  // ── Actions: document ────────────────────────────────────────────────────
  loadDoc: (doc: TrackDoc, projectId: string, projectName: string) => void;
  setAspect: (aspect: TrackAspect) => void;

  // ── Actions: tracks ──────────────────────────────────────────────────────
  addTrack: (kind: TrackKind) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, patch: Partial<Omit<Track, "id" | "clips">>) => void;
  moveTrackUp: (trackId: string) => void;
  moveTrackDown: (trackId: string) => void;

  // ── Actions: clips ───────────────────────────────────────────────────────
  addClip: (trackId: string, clip: Omit<Clip, "id" | "trackId">) => string;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newStart: number, newTrackId?: string) => void;
  resizeClipLeft: (clipId: string, deltaSeconds: number) => void;
  resizeClipRight: (clipId: string, newDuration: number) => void;
  splitClipAtTime: (clipId: string, splitTime: number) => void;
  duplicateClip: (clipId: string) => void;
  updateClipData: (clipId: string, patch: Partial<ClipData>) => void;
  rippleDelete: (clipId: string) => void;
  applyTimeCuts: (ranges: { start: number; end: number }[]) => void;

  // ── Actions: markers ─────────────────────────────────────────────────────
  addMarker: (time: number, label?: string) => void;
  removeMarker: (markerId: string) => void;

  // ── Actions: playback ────────────────────────────────────────────────────
  setCurrentTime: (t: number) => void;
  setIsPlaying: (v: boolean) => void;
  togglePlay: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (vol: number) => void;
  setDuration: (d: number) => void;

  // ── Actions: selection ────────────────────────────────────────────────────
  selectClip: (clipId: string | null) => void;
  selectTrack: (trackId: string | null) => void;

  // ── Actions: timeline UI ─────────────────────────────────────────────────
  setZoom: (zoom: number) => void;
  setTimelineScrollX: (x: number) => void;
  setSnapEnabled: (v: boolean) => void;

  // ── Actions: sidebar / panels ────────────────────────────────────────────
  setActiveSidebarTab: (tab: SidebarTab) => void;
  setAICopilotOpen: (v: boolean) => void;
  setCaptionStudioOpen: (v: boolean) => void;
  setReelsOptimizerOpen: (v: boolean) => void;
  setAutoEditOpen: (v: boolean) => void;
  setSmartReframeOpen: (v: boolean) => void;
  setExportModalOpen: (v: boolean) => void;

  // ── Actions: project ─────────────────────────────────────────────────────
  setProjectName: (name: string) => void;
  setSaveStatus: (s: SaveStatus) => void;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function pushHistory(past: TrackDoc[], present: TrackDoc): TrackDoc[] {
  const next = [...past, present];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

function mutateTracks(
  doc: TrackDoc,
  fn: (tracks: Track[]) => Track[],
): TrackDoc {
  return { ...doc, tracks: fn(doc.tracks) };
}

function mutateClip(
  doc: TrackDoc,
  clipId: string,
  fn: (clip: Clip) => Clip,
): TrackDoc {
  return mutateTracks(doc, tracks =>
    tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => (c.id === clipId ? fn(c) : c)),
    })),
  );
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>((set, get) => ({
  // defaults
  past: [],
  present: emptyTrackDoc(),
  future: [],
  currentTime: 0,
  isPlaying: false,
  playbackSpeed: 1,
  volume: 1,
  duration: 10,
  selectedClipId: null,
  selectedTrackId: null,
  zoom: 80,
  timelineScrollX: 0,
  snapEnabled: true,
  activeSidebarTab: "media",
  aiCopilotOpen: false,
  captionStudioOpen: false,
  reelsOptimizerOpen: false,
  autoEditOpen: false,
  smartReframeOpen: false,
  exportModalOpen: false,
  projectId: "",
  projectName: "Untitled Project",
  saveStatus: "saved",

  // ── History ──────────────────────────────────────────────────────────────
  undo: () => {
    const { past, present, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      present: prev,
      future: [present, ...future].slice(0, MAX_HISTORY),
      selectedClipId: null,
      saveStatus: "unsaved",
    });
  },

  redo: () => {
    const { past, present, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      past: pushHistory(past, present),
      present: next,
      future: future.slice(1),
      selectedClipId: null,
      saveStatus: "unsaved",
    });
  },

  // ── Document ─────────────────────────────────────────────────────────────
  loadDoc: (doc, projectId, projectName) => {
    set({
      past: [],
      present: doc,
      future: [],
      projectId,
      projectName,
      saveStatus: "saved",
      currentTime: 0,
      selectedClipId: null,
      duration: computeDuration(doc),
    });
  },

  setAspect: (aspect) => {
    const { past, present } = get();
    const next = { ...present, aspect };
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  // ── Tracks ───────────────────────────────────────────────────────────────
  addTrack: (kind) => {
    const { past, present } = get();
    const names: Record<TrackKind, string> = {
      video: "Video", audio: "Audio", text: "Text", effect: "Effect",
    };
    const newTrack: Track = {
      id: uid(),
      kind,
      name: `${names[kind]} ${present.tracks.filter(t => t.kind === kind).length + 1}`,
      locked: false,
      hidden: false,
      muted: false,
      clips: [],
    };
    const next = mutateTracks(present, t => [...t, newTrack]);
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  removeTrack: (trackId) => {
    const { past, present } = get();
    const next = mutateTracks(present, t => t.filter(tr => tr.id !== trackId));
    set({ past: pushHistory(past, present), present: next, future: [], selectedClipId: null, saveStatus: "unsaved" });
  },

  updateTrack: (trackId, patch) => {
    const { past, present } = get();
    const next = mutateTracks(present, tracks =>
      tracks.map(t => (t.id === trackId ? { ...t, ...patch } : t)),
    );
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  moveTrackUp: (trackId) => {
    const { past, present } = get();
    const next = mutateTracks(present, tracks => {
      const idx = tracks.findIndex(t => t.id === trackId);
      if (idx <= 0) return tracks;
      const arr = [...tracks];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  moveTrackDown: (trackId) => {
    const { past, present } = get();
    const next = mutateTracks(present, tracks => {
      const idx = tracks.findIndex(t => t.id === trackId);
      if (idx < 0 || idx >= tracks.length - 1) return tracks;
      const arr = [...tracks];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  // ── Clips ─────────────────────────────────────────────────────────────────
  addClip: (trackId, clipBase) => {
    const { past, present } = get();
    const newClip: Clip = { ...clipBase, id: uid(), trackId };
    const next = mutateTracks(present, tracks =>
      tracks.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t),
    );
    const dur = computeDuration(next);
    set({ past: pushHistory(past, present), present: next, future: [], duration: dur, saveStatus: "unsaved" });
    return newClip.id;
  },

  removeClip: (clipId) => {
    const { past, present } = get();
    const next = mutateTracks(present, tracks =>
      tracks.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== clipId) })),
    );
    const dur = computeDuration(next);
    set({
      past: pushHistory(past, present),
      present: next,
      future: [],
      selectedClipId: null,
      duration: dur,
      saveStatus: "unsaved",
    });
  },

  moveClip: (clipId, newStart, newTrackId) => {
    const { past, present } = get();
    const found = findClip(present, clipId);
    if (!found) return;

    let next: TrackDoc;
    if (newTrackId && newTrackId !== found.clip.trackId) {
      // Move to a different track
      next = mutateTracks(present, tracks => {
        return tracks.map(t => {
          if (t.id === found.clip.trackId) {
            return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
          }
          if (t.id === newTrackId) {
            return { ...t, clips: [...t.clips, { ...found.clip, trackId: newTrackId, start: Math.max(0, newStart) }] };
          }
          return t;
        });
      });
    } else {
      next = mutateClip(present, clipId, c => ({ ...c, start: Math.max(0, newStart) }));
    }

    const dur = computeDuration(next);
    set({ past: pushHistory(past, present), present: next, future: [], duration: dur, saveStatus: "unsaved" });
  },

  resizeClipLeft: (clipId, deltaSeconds) => {
    const { past, present } = get();
    const next = mutateClip(present, clipId, c => {
      const newSrcIn = Math.max(0, c.srcIn + deltaSeconds);
      const newStart = Math.max(0, c.start + deltaSeconds);
      const newDuration = Math.max(0.1, c.duration - deltaSeconds);
      return { ...c, srcIn: newSrcIn, start: newStart, duration: newDuration };
    });
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  resizeClipRight: (clipId, newDuration) => {
    const { past, present } = get();
    const found = findClip(present, clipId);
    if (!found) return;
    const maxDuration = found.clip.srcOut - found.clip.srcIn;
    const next = mutateClip(present, clipId, c => ({
      ...c,
      duration: Math.max(0.1, Math.min(newDuration, maxDuration > 0 ? maxDuration : newDuration)),
    }));
    const dur = computeDuration(next);
    set({ past: pushHistory(past, present), present: next, future: [], duration: dur, saveStatus: "unsaved" });
  },

  splitClipAtTime: (clipId, splitTime) => {
    const { past, present } = get();
    const found = findClip(present, clipId);
    if (!found) return;
    const { clip } = found;
    if (splitTime <= clip.start || splitTime >= clip.start + clip.duration) return;

    const durationA = splitTime - clip.start;
    const durationB = clip.duration - durationA;
    const srcMid = clip.srcIn + durationA * (clip.data.kind === "video" ? (clip.data as { speed?: number }).speed ?? 1 : 1);

    const clipA: Clip = { ...clip, duration: durationA, srcOut: srcMid };
    const clipB: Clip = { ...clip, id: uid(), start: splitTime, duration: durationB, srcIn: srcMid };

    const next = mutateTracks(present, tracks =>
      tracks.map(t => {
        if (t.id !== clip.trackId) return t;
        const idx = t.clips.findIndex(c => c.id === clipId);
        const clips = [...t.clips];
        clips.splice(idx, 1, clipA, clipB);
        return { ...t, clips };
      }),
    );
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  duplicateClip: (clipId) => {
    const { past, present } = get();
    const found = findClip(present, clipId);
    if (!found) return;
    const { clip, track } = found;
    const copy: Clip = { ...clip, id: uid(), start: clip.start + clip.duration };
    const next = mutateTracks(present, tracks =>
      tracks.map(t => (t.id === track.id ? { ...t, clips: [...t.clips, copy] } : t)),
    );
    const dur = computeDuration(next);
    set({ past: pushHistory(past, present), present: next, future: [], duration: dur, saveStatus: "unsaved" });
  },

  updateClipData: (clipId, patch) => {
    const { past, present } = get();
    const next = mutateClip(present, clipId, c => ({
      ...c,
      data: { ...c.data, ...patch } as ClipData,
    }));
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  rippleDelete: (clipId) => {
    const { past, present } = get();
    const found = findClip(present, clipId);
    if (!found) return;
    const { clip } = found;
    const gap = clip.start;
    const gapEnd = clip.start + clip.duration;

    const next = mutateTracks(present, tracks =>
      tracks.map(t => {
        if (t.id !== clip.trackId) return t;
        const clips = t.clips
          .filter(c => c.id !== clipId)
          .map(c => c.start >= gapEnd ? { ...c, start: c.start - clip.duration } : c);
        return { ...t, clips };
      }),
    );
    const dur = computeDuration(next);
    set({
      past: pushHistory(past, present),
      present: next,
      future: [],
      selectedClipId: null,
      duration: dur,
      saveStatus: "unsaved",
    });
    void gap; // used above for clarity
  },

  // Text-based editing / cleanup: remove timeline ranges across all tracks and
  // ripple the rest left. One undoable step regardless of how many cuts.
  applyTimeCuts: (ranges) => {
    const { past, present } = get();
    if (!ranges || ranges.length === 0) return;
    const next = removeTimeRanges(present, ranges);
    set({
      past: pushHistory(past, present),
      present: next,
      future: [],
      selectedClipId: null,
      duration: computeDuration(next),
      saveStatus: "unsaved",
    });
  },

  // ── Markers ───────────────────────────────────────────────────────────────
  addMarker: (time, label = "") => {
    const { past, present } = get();
    const marker: Marker = { id: uid(), time, label, color: "#f59e0b" };
    const next = { ...present, markers: [...present.markers, marker] };
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  removeMarker: (markerId) => {
    const { past, present } = get();
    const next = { ...present, markers: present.markers.filter(m => m.id !== markerId) };
    set({ past: pushHistory(past, present), present: next, future: [], saveStatus: "unsaved" });
  },

  // ── Playback ─────────────────────────────────────────────────────────────
  setCurrentTime: (t) => set({ currentTime: t }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setVolume: (vol) => set({ volume: vol }),
  setDuration: (d) => set({ duration: d }),

  // ── Selection ─────────────────────────────────────────────────────────────
  selectClip: (clipId) => set({ selectedClipId: clipId, selectedTrackId: null }),
  selectTrack: (trackId) => set({ selectedTrackId: trackId, selectedClipId: null }),

  // ── Timeline UI ──────────────────────────────────────────────────────────
  setZoom: (zoom) => set({ zoom: Math.max(20, Math.min(zoom, 400)) }),
  setTimelineScrollX: (x) => set({ timelineScrollX: x }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),

  // ── Sidebar / panels ─────────────────────────────────────────────────────
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),
  setAICopilotOpen: (v) => set({ aiCopilotOpen: v }),
  setCaptionStudioOpen: (v) => set({ captionStudioOpen: v }),
  setReelsOptimizerOpen: (v) => set({ reelsOptimizerOpen: v }),
  setAutoEditOpen: (v) => set({ autoEditOpen: v }),
  setSmartReframeOpen: (v) => set({ smartReframeOpen: v }),
  setExportModalOpen: (v) => set({ exportModalOpen: v }),

  // ── Project ───────────────────────────────────────────────────────────────
  setProjectName: (name) => set({ projectName: name }),
  setSaveStatus: (s) => set({ saveStatus: s }),
}));
