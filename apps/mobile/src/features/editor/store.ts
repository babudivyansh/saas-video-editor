import { ApiError, NetworkError, docDuration, type Asset, type TimelineDoc } from "@clipiro/shared";
import { AppState } from "react-native";
import { create } from "zustand";
import { editor } from "@/lib/api";
import * as ops from "./docOps";
import type { Selection } from "./docOps";

// The edit being worked on: the web editor's own timeline document
// (decision 2026-10-09 A), the files it plays (signed links from the API),
// undo / redo, the playhead and selection — and autosave. Every change is
// saved to the server about two seconds after the last one, against the
// version it was read at; a save from somewhere else since then stops
// autosave and asks to reload, rather than overwriting it.

export type SaveState = "saved" | "dirty" | "saving" | "offline" | "conflict" | "error";

/** Autosave waits this long after the last change. */
export const SAVE_DELAY_MS = 2000;
const MAX_UNDO = 50;
/** The phone won't split closer than this to a clip's edge. */
const MIN_PIECE = 0.3;

type State = {
  projectId: string | null;
  title: string;
  version: number;
  doc: TimelineDoc;
  media: Record<string, Asset>;
  loading: boolean;
  loadError: unknown;
  save: SaveState;
  saveError: string | null;
  past: TimelineDoc[];
  future: TimelineDoc[];
  playhead: number;
  playing: boolean;
  selected: Selection | null;

  open: (projectId: string) => Promise<void>;
  /** Change the doc as one undoable step (and autosave it). */
  edit: (fn: (d: TimelineDoc) => TimelineDoc, select?: Selection | null) => void;
  undo: () => void;
  redo: () => void;
  split: () => boolean;
  duplicate: () => boolean;
  remove: () => boolean;
  seek: (t: number) => void;
  select: (sel: Selection | null) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  /** Saves now (autosave, leaving the editor, Export). Resolves once it's on the server. */
  flush: () => Promise<boolean>;
  /** Files added to the doc (Media panel) — their playable links. */
  addMedia: (assets: Asset[]) => void;
  reset: () => void;
};

const EMPTY: TimelineDoc = { version: 1, aspect: "9:16", fps: 30, tracks: { video: [], text: [], audio: [], image: [], caption: [] } };

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<boolean> | null = null;

export const durationOf = (doc: TimelineDoc) => docDuration(doc);

export const useEditor = create<State>((set, get) => {
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), SAVE_DELAY_MS);
  };

  const commit = (doc: TimelineDoc, selected?: Selection | null) => {
    set((s) => ({
      doc,
      past: [...s.past, s.doc].slice(-MAX_UNDO),
      future: [],
      save: s.save === "conflict" ? "conflict" : "dirty",
      ...(selected !== undefined ? { selected } : {}),
      playhead: Math.min(s.playhead, Math.max(0, durationOf(doc))),
    }));
    if (get().save !== "conflict") schedule();
  };

  return {
    projectId: null,
    title: "",
    version: 0,
    doc: EMPTY,
    media: {},
    loading: false,
    loadError: null,
    save: "saved",
    saveError: null,
    past: [],
    future: [],
    playhead: 0,
    playing: false,
    selected: null,

    open: async (projectId) => {
      if (timer) clearTimeout(timer);
      set({ projectId, loading: true, loadError: null, past: [], future: [], playhead: 0, playing: false, selected: null, save: "saved", saveError: null });
      try {
        const e = await editor.open(projectId);
        if (get().projectId !== projectId) return; // another edit was opened meanwhile
        set({ title: e.title, version: e.version, doc: e.doc, media: e.media, loading: false });
      } catch (err) {
        if (get().projectId === projectId) set({ loading: false, loadError: err });
      }
    },

    edit: (fn, select) => commit(fn(get().doc), select),

    undo: () => {
      const { past, doc, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selected: null, save: get().save === "conflict" ? "conflict" : "dirty" });
      schedule();
    },
    redo: () => {
      const { past, doc, future } = get();
      const next = future[0];
      if (!next) return;
      set({ doc: next, past: [...past, doc], future: future.slice(1), selected: null, save: get().save === "conflict" ? "conflict" : "dirty" });
      schedule();
    },

    /** Splits the selected clip, or the video clip under the playhead. False when too close to an edge. */
    split: () => {
      const { doc, playhead, selected } = get();
      const target = ops.findClip(doc, selected) ?? doc.tracks.video.find((c) => playhead >= c.timelineStart && playhead < c.timelineStart + c.duration);
      if (!target || playhead - target.timelineStart < MIN_PIECE || target.timelineStart + target.duration - playhead < MIN_PIECE) return false;
      const r = ops.split(doc, playhead, selected?.track === "caption" || selected?.track === "video" ? selected : null);
      if (!r) return false;
      commit(r.doc, r.selected);
      return true;
    },
    duplicate: () => {
      const { doc, selected } = get();
      const r = selected && ops.duplicate(doc, selected);
      if (!r) return false;
      commit(r.doc, r.selected);
      return true;
    },
    remove: () => {
      const { doc, selected } = get();
      if (!selected || !ops.findClip(doc, selected)) return false;
      commit(ops.remove(doc, selected), null);
      return true;
    },

    seek: (t) => set((s) => ({ playhead: Math.max(0, Math.min(t, durationOf(s.doc))) })),
    select: (selected) => set({ selected }),
    setPlaying: (playing) => set({ playing }),
    togglePlay: () => set((s) => ({ playing: !s.playing && durationOf(s.doc) > 0, playhead: !s.playing && s.playhead >= durationOf(s.doc) - 0.05 ? 0 : s.playhead })),

    flush: async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (inFlight) await inFlight;
      const s = get();
      if (!s.projectId || s.save === "saved" || s.save === "conflict") return s.save === "saved";
      const doc = s.doc;
      set({ save: "saving" });
      inFlight = (async () => {
        try {
          const { version } = await editor.save(s.projectId!, doc, get().version);
          // An edit made while saving is still waiting.
          set({ version, save: get().doc === doc ? "saved" : "dirty", saveError: null });
          if (get().doc !== doc) schedule();
          return true;
        } catch (e) {
          if (e instanceof ApiError && e.code === "version_conflict") set({ save: "conflict", saveError: e.message });
          else if (e instanceof NetworkError) set({ save: "offline", saveError: e.message });
          else set({ save: "error", saveError: e instanceof ApiError ? e.message : "Couldn’t save this edit." });
          return false;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },

    addMedia: (assets) => set((s) => ({ media: { ...s.media, ...Object.fromEntries(assets.map((a) => [a.id, a])) } })),

    reset: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      set({ projectId: null, title: "", version: 0, doc: EMPTY, media: {}, loading: false, loadError: null, save: "saved", saveError: null, past: [], future: [], playhead: 0, playing: false, selected: null });
    },
  };
});

// Offline saves try again when the app comes back to the foreground.
AppState.addEventListener("change", (s) => {
  const st = useEditor.getState();
  if (s === "active" && (st.save === "offline" || st.save === "dirty")) void st.flush();
  // Leaving the app saves what's there.
  if (s !== "active" && st.save === "dirty") void st.flush();
});

/** "0:14.20" — the timeline's clock. */
export function clock(t: number, hundredths = true): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t % 1) * 100) % 100;
  return `${m}:${String(s).padStart(2, "0")}${hundredths ? `.${String(cs).padStart(2, "0")}` : ""}`;
}
