import type { Tool, ToolCost } from "@clipiro/shared";
import { router, type Href } from "expo-router";
import type { IconName } from "@/components";

// How each tool looks and where tapping it goes. Tools with a mobile screen
// open it; the rest say "coming soon" (decision 2026-10-01: toast, not a
// web view — the app's login doesn't carry over to clipiro.com yet).

export const TOOL_ICONS: Record<string, IconName> = {
  autoclip: "scissors",
  "cut-and-crop": "crop",
  "voice-changer": "mic",
  "subtitle-remover": "captions",
  "face-swap": "person",
  "enhance-speech": "waveform",
  "vocal-remover": "music",
  "background-remover": "magic",
  "image-generator": "image",
  voiceover: "volume",
  brainstormer: "bulb",
  "youtube-downloader": "download",
  "instagram-downloader": "download",
  "video-compressor": "projects",
  "audio-balancer": "waveform",
  "mp3-converter": "music",
};

/** The 8 tools on the Home grid, in the design's order. */
export const HOME_TOOL_IDS = [
  "cut-and-crop",
  "voice-changer",
  "subtitle-remover",
  "image-generator",
  "face-swap",
  "voiceover",
  "background-remover",
  "vocal-remover",
];

/** Recommended-card photos (decorative). */
export const TOOL_PHOTOS: Record<string, "travel-summit" | "podcast-mic" | "clapper"> = {
  "image-generator": "travel-summit",
  voiceover: "podcast-mic",
  brainstormer: "clapper",
};

const aiMedia = (tab: string): Href => ({ pathname: "/create/ai-media", params: { tab } });
const ROUTES: Record<string, Href> = {
  autoclip: "/create/autoclip",
  "cut-and-crop": "/editor",
  "image-generator": aiMedia("image"),
  voiceover: aiMedia("voiceover"),
  "enhance-speech": aiMedia("enhance"),
  "vocal-remover": aiMedia("vocal"),
};

export const hasScreen = (id: string) => id in ROUTES;

/** Opens the tool, or returns false when it isn't in the app yet. */
export function openTool(id: string): boolean {
  const href = ROUTES[id];
  if (!href) return false;
  router.push(href);
  return true;
}

export const COMING_SOON = "Coming to the app soon. Use it on clipiro.com for now.";

/** "8 credits / min", "1 cr / 500 chars", "From 2 credits", "Free", "Clip minutes". */
export function costLabel(cost: ToolCost): string {
  if (cost.kind === "free") return "Free";
  if (cost.kind === "clipMinutes") return "Clip minutes";
  if (cost.per === "500 chars") return `${cost.amount} cr / 500 chars`;
  const unit = cost.amount === 1 ? "credit" : "credits";
  const base = cost.from ? `From ${cost.amount} ${unit}` : `${cost.amount} ${unit}`;
  return cost.per ? `${base} / ${cost.per}` : base;
}

export type ToolFilter = "all" | Tool["category"] | "free";
export function filterTools(tools: Tool[], filter: ToolFilter, query: string): Tool[] {
  const q = query.trim().toLowerCase();
  return tools.filter((t) => {
    if (filter === "free" ? t.cost.kind !== "free" : filter !== "all" && t.category !== filter) return false;
    return !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
  });
}
