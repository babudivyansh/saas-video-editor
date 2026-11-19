// Per-feature maintenance: WHICH features can be switched off, and which
// pages and API routes belong to each. Pure data + path matching, no I/O —
// proxy.ts imports this on every request, so it must stay light (the store,
// with Redis/Prisma, is lib/feature-maintenance.ts and only loaded when a
// path actually belongs to a feature).
//
// The feature list is derived from the product's own link registry
// (app/components/featureLinks.ts — the same list the navbar, footer, Tools
// hub and Home render) plus Social Tracker, which is a first-class nav item
// rather than a "tool". A feature's id is its public slug.

import { ALL_TOOLS, type FeatureLink } from "@/app/components/featureLinks";

/** The exact copy users see, on the page and in every refused API call. */
export const FEATURE_MAINTENANCE_MESSAGE = "Under maintenance. Please check after some time.";

export type MaintenanceGroup = "create" | "ai" | "free" | "social";

export const MAINTENANCE_GROUP_LABELS: Record<MaintenanceGroup, string> = {
  create: "Create",
  ai: "Tools",
  free: "Free tools",
  social: "Social",
};

export interface MaintenanceFeature {
  id: string;
  label: string;
  group: MaintenanceGroup;
  /** Dashboard pages (prefixes) that show the maintenance state instead. */
  pagePaths: string[];
  /**
   * API path prefixes whose non-GET calls are refused with a 503. `*` matches
   * exactly one path segment (a dynamic `[id]`). Reads (GET/HEAD) stay open so
   * users can still see and download what they already made.
   */
  apiPaths: string[];
}

// Every API surface that starts NEW work for a feature, web and Android app
// (/api/mobile/v1) and the public API (/api/v1). The Android app's generic
// POST /api/mobile/v1/jobs takes the tool in its body, so it gates in-route
// (MOBILE_JOB_FEATURE below) rather than here.
const API_PATHS: Record<string, string[]> = {
  "video-editor": [
    "/api/editor",
    "/api/mobile/v1/editor",
    "/api/mobile/v1/projects/*/editor",
    "/api/mobile/v1/projects/*/export",
  ],
  "auto-clip": ["/api/generate/auto-clip", "/api/v1/clips"],
  "cut-and-crop": ["/api/tools/cut-and-crop"],
  "caption-studio": ["/api/captions"],
  "ai-image-generator": ["/api/tools/image-generator"],
  "ai-voiceover": ["/api/tools/voiceover", "/api/tools/voice-preview"],
  "ai-face-swap": ["/api/tools/face-swap"],
  "ai-photo-editor": ["/api/tools/photo-edit"],
  "background-remover": ["/api/tools/background-remover"],
  "ai-voice-changer": ["/api/tools/voice-changer"],
  "ai-vocal-remover": ["/api/tools/vocal-remover"],
  "ai-speech-enhancer": ["/api/tools/enhance-speech"],
  "subtitle-remover": ["/api/tools/subtitle-remover"],
  "ai-brainstormer": ["/api/tools/brainstormer"],
  "audio-balancer": ["/api/tools/audio-balancer"],
  "video-compressor": ["/api/tools/video-compressor"],
  "mp3-converter": ["/api/tools/mp3-converter"],
  "youtube-downloader": ["/api/tools/youtube-downloader"],
  "instagram-downloader": ["/api/tools/instagram-downloader"],
  "social-tracker": ["/api/social", "/api/mobile/v1/social"],
};

/** POST /api/mobile/v1/jobs `type` → the feature it starts. */
export const MOBILE_JOB_FEATURE: Record<string, string> = {
  autoclip: "auto-clip",
  export: "video-editor",
  "ai-image": "ai-image-generator",
  voiceover: "ai-voiceover",
  "enhance-speech": "ai-speech-enhancer",
  "vocal-remover": "ai-vocal-remover",
  "voice-changer": "ai-voice-changer",
  "background-remover": "background-remover",
  "face-swap": "ai-face-swap",
  "subtitle-remover": "subtitle-remover",
};

function groupFor(tool: FeatureLink): MaintenanceGroup {
  if (tool.category === "free" || tool.appGroup === "free") return "free";
  if (tool.category === "video" && !tool.appGroup) return "create"; // Editor, AutoClip
  if (tool.slug === "caption-studio" || tool.slug === "cut-and-crop") return "create";
  return "ai";
}

const GROUP_ORDER: MaintenanceGroup[] = ["create", "ai", "free", "social"];

export const MAINTENANCE_FEATURES: MaintenanceFeature[] = [
  ...ALL_TOOLS.map((tool) => ({
    id: tool.slug,
    label: tool.title,
    group: groupFor(tool),
    pagePaths: [tool.href],
    apiPaths: API_PATHS[tool.slug] ?? [],
  })),
  {
    id: "social-tracker",
    label: "Social Tracker",
    group: "social" as const,
    pagePaths: ["/dashboard/social-tracker"],
    apiPaths: API_PATHS["social-tracker"],
  },
].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

const BY_ID = new Map(MAINTENANCE_FEATURES.map((f) => [f.id, f]));

export function getMaintenanceFeature(id: string): MaintenanceFeature | undefined {
  return BY_ID.get(id);
}

export function isMaintenanceFeatureId(id: string): boolean {
  return BY_ID.has(id);
}

/** True when `pathname` is `prefix` or below it; `*` in the prefix matches one segment. */
function pathMatches(pathname: string, prefix: string): boolean {
  const want = prefix.split("/");
  const got = pathname.split("/");
  if (got.length < want.length) return false;
  return want.every((seg, i) => seg === "*" ? got[i] !== "" : seg === got[i]);
}

// Longest prefix first, so /dashboard/tools/free/audio-balancer can never be
// shadowed by a shorter one.
const PAGE_INDEX = MAINTENANCE_FEATURES
  .flatMap((f) => f.pagePaths.map((p) => ({ p, f })))
  .sort((a, b) => b.p.length - a.p.length);
const API_INDEX = MAINTENANCE_FEATURES
  .flatMap((f) => f.apiPaths.map((p) => ({ p, f })))
  .sort((a, b) => b.p.length - a.p.length);

/** The feature a dashboard page belongs to, if any. */
export function featureForPagePath(pathname: string): MaintenanceFeature | undefined {
  return PAGE_INDEX.find(({ p }) => pathMatches(pathname, p))?.f;
}

/**
 * The feature an API call would start new work for, if any. Reads are never
 * gated: GET/HEAD/OPTIONS return undefined.
 */
export function featureForApiCall(pathname: string, method: string): MaintenanceFeature | undefined {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return undefined;
  return API_INDEX.find(({ p }) => pathMatches(pathname, p))?.f;
}
