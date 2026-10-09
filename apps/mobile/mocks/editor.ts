import type { AiTextOperationId, Asset, CaptionClip, EditorOpen, EditorVoice, StockItem, TimelineDoc, VideoClip } from "@clipiro/shared";
import { ApiError, respond, wait } from "./core";

// The editor's API as fixtures (src/test/mockServer.ts serves them as
// /api/mobile/v1): the edit itself, stock search, AI text, voices, and the
// words a transcription finds. Scenarios (core.ts): "edit", "stock",
// "ai-text", "captions", "voices", "export" (a render that fails).

const STOCK: Record<"video" | "image", StockItem[]> = {
  video: [
    { id: "pv1", name: "Mountain sunrise", thumbUrl: "asset:travel-summit", downloadUrl: "https://videos.pexels.test/1.mp4", width: 1080, height: 1920, durationSec: 15, attribution: "Ana B. on Pexels" },
    { id: "pv2", name: "Film set", thumbUrl: "asset:clapper", downloadUrl: "https://videos.pexels.test/2.mp4", width: 1920, height: 1080, durationSec: 8, attribution: "Leo K. on Pexels" },
    { id: "pv3", name: "Neon club", thumbUrl: "asset:dj-neon", downloadUrl: "https://videos.pexels.test/3.mp4", width: 1080, height: 1920, durationSec: 11, attribution: "Mia R. on Pexels" },
  ],
  image: [
    { id: "pi1", name: "Conference stage", thumbUrl: "asset:keynote-stage", downloadUrl: "https://images.pexels.test/1.jpg", width: 1600, height: 900, attribution: "Sam T. on Pexels" },
    { id: "pi2", name: "Podcast studio", thumbUrl: "asset:studio-mic", downloadUrl: "https://images.pexels.test/2.jpg", width: 1200, height: 1600, attribution: "Ola N. on Pexels" },
  ],
};

/** GET /editor/stock — Pexels on the server. */
export async function searchStock(type: string, q: string): Promise<StockItem[]> {
  const s = await respond("stock");
  const list = STOCK[type as "video" | "image"] ?? [];
  const needle = q.trim().toLowerCase();
  return s === "empty" ? [] : list.filter((i) => i.name.toLowerCase().includes(needle) || needle === "all");
}

/** POST /editor/stock/import — the result saved into Assets. */
export function stockAsset(type: string, item: StockItem): Asset {
  return {
    id: `stock_${item.id}`,
    name: item.name,
    kind: type === "image" ? "image" : "video",
    sizeBytes: 4_000_000,
    durationSec: item.durationSec ?? null,
    thumbnailUrl: item.thumbUrl,
    folderId: null,
    favorite: false,
    archivedAt: null,
    source: "stock",
    madeWith: null,
    status: "ready",
    createdAt: "2026-10-10T09:00:00.000Z",
    url: item.downloadUrl,
  };
}

/** POST /editor/ai-text — every line comes back changed in a way a test can read. */
export async function runAiText(operation: AiTextOperationId, texts: string[], targetLang?: string): Promise<string[]> {
  await respond("ai-text");
  if (operation === "translate") return texts.map((t) => `[${targetLang}] ${t}`);
  if (operation === "fillerWords") return texts.map((t) => t.replace(/\b(um|uh|like),?\s*/gi, ""));
  if (operation === "emojis") return texts.map((t) => `${t} 🔥`);
  return texts.map((t) => `${t} (${operation})`);
}

/**
 * POST /editor/captions — the words heard in a file, in source milliseconds:
 * the podcast talks where the edit's two podcast clips are cut from
 * (812 s and 840 s); the b-roll is silent.
 */
export async function transcribe(assetId: string): Promise<{ word: string; start: number; end: number }[]> {
  const s = await respond("captions");
  if (s === "empty" || assetId !== "a_ep42") return [];
  const say = (from: number, line: string) => line.split(" ").map((word, i) => ({ word, start: from * 1000 + i * 400, end: from * 1000 + i * 400 + 380 }));
  return [...say(812, "nobody tells you this part about building in public"), ...say(840, "you ship and then you wait")];
}

const VOICES: EditorVoice[] = [
  { id: "brian", name: "Brian", description: "Deep, steady narrator", gender: "male", accent: "American", previewUrl: null, creditMultiplier: 1 },
  { id: "aria", name: "Aria", description: "Warm and upbeat", gender: "female", accent: "British", previewUrl: "https://cdn.test/voices/aria.mp3", creditMultiplier: 1 },
];

/** GET /voices */
export async function getVoices(): Promise<{ configured: boolean; voices: EditorVoice[] }> {
  const s = await respond("voices");
  return { configured: s !== "empty", voices: s === "empty" ? [] : VOICES };
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

// ── Exports (POST /jobs { type: "export" }, GET /jobs/exp_<projectId>) ──
// A render reports progress once, then finishes; scenario "export" = "error"
// makes it fail (refunded), as the server reports a failed render.

let render: { polls: number } | null = null;
export function resetExportMock() {
  render = null;
}
export async function startRender(projectId: string): Promise<string> {
  await wait();
  if (projectId !== EDIT_ID) throw new ApiError("Project not found", 404);
  if (render && render.polls < 2) throw Object.assign(new ApiError("This video is already exporting.", 409), { code: "already_rendering" });
  render = { polls: 0 };
  return `exp_${projectId}`;
}
/** The export job as GET /jobs reports it: running, then done (or failed). */
export async function renderJob(jobId: string) {
  const s = await respond("export").catch(() => "error" as const);
  const base = { id: jobId, type: "export" as const, stage: null, createdAt: "2026-10-10T09:00:00.000Z" };
  if (!render) return { ...base, status: "queued" as const, progress: 0, error: null, result: null };
  render.polls++;
  if (render.polls < 2) return { ...base, status: "running" as const, progress: 40, stage: "rendering" as const, error: null, result: null };
  if (s === "error") return { ...base, status: "failed" as const, progress: 40, error: "Video encoding failed. Please try exporting again. Your credit was refunded.", result: null };
  return { ...base, status: "done" as const, progress: 100, error: null, result: { assetId: null, url: `https://cdn.test/renders/${EDIT_ID}.mp4`, projectId: EDIT_ID, clipCount: null } };
}
/** POST /projects/:id/export/asset — the export, copied into Assets. */
export function exportAsset(): Asset {
  return { ...editAsset("ex_1", "Nobody tells you this part.mp4", 41), source: "editor", url: `https://cdn.test/ex_1.mp4` };
}
