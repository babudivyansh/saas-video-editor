import type { Asset, CaptionClip, EditorOpen, TimelineDoc, VideoClip } from "@clipiro/shared";
import { ApiError, respond, wait } from "./core";

// Stand-in for the editor's API until Phase 9 (project doc, media library,
// stock search via Pexels / Jamendo / Giphy, AI text, render jobs).
// Scenarios (core.ts): "media", "stock", "ai-text", "export".

export type MediaItem = { id: string; kind: "video" | "image" | "gif"; thumbnailUrl: string; durationSec: number | null; title: string };

const LIBRARY: MediaItem[] = [
  { id: "m1", kind: "video", thumbnailUrl: "asset:podcast-mic", durationSec: 58 * 60 + 40, title: "Founders Pod · Ep. 42" },
  { id: "m2", kind: "video", thumbnailUrl: "asset:travel-summit", durationSec: 12, title: "Summit b-roll" },
  { id: "m3", kind: "video", thumbnailUrl: "asset:gym-lift", durationSec: 44, title: "Leg day" },
  { id: "m4", kind: "video", thumbnailUrl: "asset:keynote-stage", durationSec: 134, title: "Keynote" },
  { id: "m5", kind: "video", thumbnailUrl: "asset:dj-neon", durationSec: 6, title: "DJ teaser" },
  { id: "m6", kind: "video", thumbnailUrl: "asset:creator-denim", durationSec: 9, title: "Street walk" },
  { id: "m7", kind: "image", thumbnailUrl: "asset:clapper", durationSec: null, title: "Clapper" },
  { id: "m8", kind: "image", thumbnailUrl: "asset:studio-mic", durationSec: null, title: "Studio mic" },
  { id: "m9", kind: "gif", thumbnailUrl: "asset:creator-hat", durationSec: null, title: "Wave" },
];

export async function getMediaLibrary(): Promise<MediaItem[]> {
  const s = await respond("media");
  return s === "empty" ? [] : LIBRARY;
}

const STOCK: MediaItem[] = [
  { id: "s1", kind: "video", thumbnailUrl: "asset:travel-summit", durationSec: 15, title: "Mountain sunrise" },
  { id: "s2", kind: "video", thumbnailUrl: "asset:clapper", durationSec: 8, title: "Film set" },
  { id: "s3", kind: "image", thumbnailUrl: "asset:keynote-stage", durationSec: null, title: "Conference stage" },
  { id: "s4", kind: "video", thumbnailUrl: "asset:dj-neon", durationSec: 11, title: "Neon club" },
  { id: "s5", kind: "image", thumbnailUrl: "asset:studio-mic", durationSec: null, title: "Podcast studio" },
  { id: "s6", kind: "gif", thumbnailUrl: "asset:creator-violet", durationSec: null, title: "Sparkle sticker" },
];

/** Pexels (photos, video) and Giphy (stickers) on the web. */
export async function searchStock(query: string): Promise<MediaItem[]> {
  const s = await respond("stock");
  if (s === "empty") return [];
  const q = query.trim().toLowerCase();
  return q ? STOCK.filter((i) => i.title.toLowerCase().includes(q)) : STOCK;
}

export type MusicTrack = { id: string; title: string; artist: string; durationSec: number; mood: string };
/** Jamendo (Creative Commons) on the web. */
export async function getStockMusic(): Promise<MusicTrack[]> {
  await wait();
  return [
    { id: "j1", title: "Upbeat drive", artist: "Lumen Park", durationSec: 142, mood: "Upbeat" },
    { id: "j2", title: "Night shift", artist: "Kōda", durationSec: 188, mood: "Chill" },
    { id: "j3", title: "Big reveal", artist: "Harbor Lights", durationSec: 96, mood: "Epic" },
    { id: "j4", title: "Morning coffee", artist: "Sol & Fern", durationSec: 121, mood: "Acoustic" },
  ];
}

export const CAPTION_LINES = [
  "Nobody tells you this part",
  "about building in public.",
  "You ship, and then you wait.",
  "The first ten users matter most.",
];

/** /api/editor/ai-text: rewrites every caption line (mock: returns a note). */
export async function runAiText(op: string, language?: string): Promise<string> {
  await respond("ai-text");
  const done: Record<string, string> = {
    rewrite: "Captions rewritten.",
    grammar: "Grammar fixed.",
    readability: "Captions made easier to read.",
    shorten: "Captions shortened.",
    expand: "Captions expanded.",
    viral: "Captions punched up.",
    translate: `Captions translated to ${language ?? "Spanish"}.`,
    emojis: "Emojis added.",
    lineBreaks: "Line breaks added.",
    fillerWords: "Filler words removed.",
  };
  return done[op] ?? "Done.";
}

export async function startExport(): Promise<{ jobId: string }> {
  await respond("export");
  return { jobId: "render_1" };
}

// ── The edit the editor opens (GET /projects/:id/editor) ─────────────────
// A podcast cut into three clips with word-timed captions, as the web's
// "Edit in editor" makes from an AutoClip clip. Tests and the dev gallery use
// it through src/test/mockServer.ts.

const caption = (id: string, start: number, words: string[]): CaptionClip => ({
  id,
  type: "caption",
  timelineStart: start,
  duration: words.length * 0.5,
  text: words.join(" "),
  words: words.map((word, i) => ({ word, startMs: i * 500, endMs: (i + 1) * 500 })),
  fontFamily: "Poppins",
  fontSizePct: 0.05,
  color: "#ffffff",
  bold: true,
  bgColor: null,
  x: 0.5,
  y: 0.8,
  positionPreset: "bottom",
  highlightMode: "word",
  highlightColor: "#20d68a",
});

const video = (id: string, assetId: string, start: number, duration: number, srcIn: number): VideoClip => ({ id, type: "video", assetId, timelineStart: start, duration, srcIn, volume: 1, muted: false });

const editAsset = (id: string, name: string, durationSec: number): Asset => ({
  id,
  name,
  kind: "video",
  sizeBytes: 50_000_000,
  durationSec,
  thumbnailUrl: "asset:creator-smile",
  folderId: null,
  favorite: false,
  archivedAt: null,
  source: "autoclip",
  madeWith: null,
  status: "ready",
  createdAt: "2026-10-09T09:00:00.000Z",
  url: `https://cdn.test/${id}.mp4`,
});

export const EDIT_ID = "ed_founders";

export function editFixture(): EditorOpen {
  const doc: TimelineDoc = {
    version: 1,
    aspect: "9:16",
    fps: 30,
    tracks: {
      video: [video("v1", "a_ep42", 0, 15, 812), video("v2", "a_ep42", 15, 7, 840), video("v3", "a_broll", 22, 19, 0)],
      text: [],
      audio: [],
      image: [],
      caption: [caption("c1", 0, ["nobody", "tells", "you", "this", "part"]), caption("c2", 3, ["and", "it", "costs", "you"])],
    },
  };
  return { projectId: EDIT_ID, title: "Nobody tells you this part", version: 3, doc, media: { a_ep42: editAsset("a_ep42", "Founders Pod · Ep. 42.mp4", 3492), a_broll: editAsset("a_broll", "Summit b-roll.mp4", 41) } };
}

let edit = editFixture();
export function resetEditMock() {
  edit = editFixture();
}
export async function getEdit(id: string): Promise<EditorOpen> {
  await respond("edit");
  if (id !== EDIT_ID) throw new ApiError("Edit not found", 404);
  return edit;
}
/** Saves against the version it was read at, like the server. */
export async function saveEdit(id: string, doc: TimelineDoc, expectedVersion: number): Promise<{ version: number }> {
  await wait();
  if (id !== EDIT_ID) throw new ApiError("Edit not found", 404);
  if (expectedVersion !== edit.version) throw Object.assign(new ApiError("This edit was changed somewhere else. Reload to get the latest version.", 409), { code: "version_conflict" });
  edit = { ...edit, doc, version: edit.version + 1 };
  return { version: edit.version };
}
/** Something else saved the edit (another phone, the web). */
export function bumpEditElsewhere() {
  edit = { ...edit, version: edit.version + 1 };
}
