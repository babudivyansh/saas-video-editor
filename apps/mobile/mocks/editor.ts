import { respond, wait } from "./core";

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
