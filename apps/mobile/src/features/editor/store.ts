import type { EditorAspect, EditorFont } from "@clipiro/shared";
import { create } from "zustand";
import type { SampleImage } from "@/lib/images";

// The project being edited. A mock stand-in for Phase 9's real edit state: it
// keeps the shape (segments on a timeline, captions, audio, looks, text) and
// undo / redo, so every panel can visibly change the preview.

export type Segment = { id: string; photo: SampleImage; start: number; end: number };
export type TextOverlay = { id: string; preset: string; text: string; font: EditorFont; color: string; animation: string };

export type EditorDoc = {
  title: string;
  aspect: EditorAspect;
  segments: Segment[];
  captions: { templateId: string; highlight: "none" | "word" | "phrase" | "karaoke"; position: "top" | "center" | "bottom"; sizePx: number; language: string };
  audio: { original: number; music: { title: string; volume: number } | null; voiceover: { voice: string; volume: number } | null };
  look: { effect: string; effectIntensity: number; filter: string; transition: string };
  texts: TextOverlay[];
};

export const INITIAL_DOC: EditorDoc = {
  title: "Untitled project",
  aspect: "9:16",
  segments: [
    { id: "seg1", photo: "creator-smile", start: 0, end: 15 },
    { id: "seg2", photo: "founder-portrait", start: 15, end: 22 },
    { id: "seg3", photo: "creator-smile", start: 22, end: 41 },
  ],
  captions: { templateId: "hormozi", highlight: "word", position: "bottom", sizePx: 48, language: "English" },
  audio: { original: 100, music: { title: "Upbeat drive", volume: 30 }, voiceover: { voice: "Brian", volume: 85 } },
  look: { effect: "none", effectIntensity: 60, filter: "none", transition: "none" },
  texts: [],
};

export const durationOf = (doc: EditorDoc) => doc.segments.reduce((t, s) => t + (s.end - s.start), 0);

/** Each clip with where it starts on the timeline. */
export function placed(doc: EditorDoc): { seg: Segment; start: number; len: number }[] {
  return doc.segments.map((seg, i) => ({
    seg,
    start: doc.segments.slice(0, i).reduce((t, s) => t + (s.end - s.start), 0),
    len: seg.end - seg.start,
  }));
}

/** The clip under time t (the last one past the end). */
export const clipAt = (doc: EditorDoc, t: number) => placed(doc).find((p) => t < p.start + p.len) ?? placed(doc)[doc.segments.length - 1];

type State = {
  doc: EditorDoc;
  past: EditorDoc[];
  future: EditorDoc[];
  playhead: number;
  playing: boolean;
  selected: string | null;
  /** Change the doc as one undoable step. */
  edit: (fn: (d: EditorDoc) => EditorDoc) => void;
  undo: () => void;
  redo: () => void;
  split: () => boolean;
  remove: () => boolean;
  seek: (t: number) => void;
  select: (id: string | null) => void;
  togglePlay: () => void;
  reset: () => void;
};

const MIN_PIECE = 0.5;

export const useEditor = create<State>((set, get) => ({
  doc: INITIAL_DOC,
  past: [],
  future: [],
  playhead: 14.2,
  playing: false,
  selected: null,
  edit: (fn) => set((s) => ({ doc: fn(s.doc), past: [...s.past, s.doc].slice(-50), future: [] })),
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      return prev ? { doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future] } : s;
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      return next ? { doc: next, past: [...s.past, s.doc], future: s.future.slice(1) } : s;
    }),
  /** Split the clip under the playhead. False when it's too close to an edge. */
  split: () => {
    const { doc, playhead } = get();
    let t = 0;
    const i = doc.segments.findIndex((s) => {
      const len = s.end - s.start;
      const hit = playhead >= t && playhead < t + len;
      if (!hit) t += len;
      return hit;
    });
    const seg = doc.segments[i];
    if (!seg) return false;
    const at = seg.start + (playhead - t);
    if (at - seg.start < MIN_PIECE || seg.end - at < MIN_PIECE) return false;
    get().edit((d) => ({
      ...d,
      segments: [...d.segments.slice(0, i), { ...seg, end: at }, { ...seg, id: `${seg.id}b${d.segments.length}`, start: at }, ...d.segments.slice(i + 1)],
    }));
    return true;
  },
  /** Delete the selected clip (never the last one). */
  remove: () => {
    const { doc, selected } = get();
    if (!selected || doc.segments.length <= 1) return false;
    get().edit((d) => ({ ...d, segments: d.segments.filter((s) => s.id !== selected) }));
    set((s) => ({ selected: null, playhead: Math.min(s.playhead, durationOf(s.doc)) }));
    return true;
  },
  seek: (t) => set((s) => ({ playhead: Math.max(0, Math.min(t, durationOf(s.doc))) })),
  select: (selected) => set({ selected }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  reset: () => set({ doc: INITIAL_DOC, past: [], future: [], playhead: 14.2, playing: false, selected: null }),
}));

/** "0:14.20" — the timeline's clock. */
export function clock(t: number, hundredths = true): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t % 1) * 100) % 100;
  return `${m}:${String(s).padStart(2, "0")}${hundredths ? `.${String(cs).padStart(2, "0")}` : ""}`;
}
