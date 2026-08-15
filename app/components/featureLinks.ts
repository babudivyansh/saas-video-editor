// Single source of truth for the product's feature/tool links, mirrored from the
// dashboard (`app/dashboard/page.tsx`) and tools (`app/dashboard/tools/page.tsx`)
// pages. Both the navbar Features dropdown and the footer import these so the
// two surfaces always list the full, identical feature set.
//
// Each tool has two destinations:
//   `href`  — the tool itself, inside the gated app.
//   `slug`  — its public marketing page at /tools/<slug>.
//
// Public surfaces (navbar, footer, homepage ToolShowcase) must link to the
// slug. Sending a logged-out visitor to `href` bounces them to /login via
// proxy.ts, and /dashboard/ is disallowed in robots.ts, so those links were
// both a dead end and invisible to search.

export interface FeatureLink {
  title: string;
  desc: string;
  href: string;
  /** Public marketing page → /tools/<slug>. Slugs are unique across all three lists. */
  slug: string;
  category: ToolCategory;
  external?: boolean;
}

export type ToolCategory = "video" | "ai" | "free";

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  video: "Video Tools",
  ai: "AI Tools",
  free: "Free Tools",
};

// Free tools + downloaders (no credits required).
export const FREE_FEATURES: FeatureLink[] = [
  { title: "Audio Balancer", desc: "Balance left & right audio channels", href: "/dashboard/tools/free/audio-balancer", slug: "audio-balancer", category: "free" },
  { title: "Video Compressor", desc: "Shrink video size without quality loss", href: "/dashboard/tools/free/video-compressor", slug: "video-compressor", category: "free" },
  { title: "MP3 Converter", desc: "Convert any media file to MP3", href: "/dashboard/tools/free/mp3-converter", slug: "mp3-converter", category: "free" },
  { title: "YouTube Downloader", desc: "Download YouTube videos in a click", href: "/dashboard/tools/youtube-downloader", slug: "youtube-downloader", category: "free" },
  { title: "Instagram Downloader", desc: "Save Reels, posts & IGTV", href: "/dashboard/tools/instagram-downloader", slug: "instagram-downloader", category: "free" },
];

// Video creation workflows (faceless videos, clipping, editing).
export const VIDEO_TOOLS: FeatureLink[] = [
  { title: "Video Editor", desc: "Multi-track timeline editor in your browser", href: "/dashboard/editor", slug: "video-editor", category: "video" },
  { title: "Clipiro AutoClip", desc: "Long videos into viral clips, automatically", href: "/dashboard/create/auto-clip", slug: "auto-clip", category: "video" },
  { title: "Cut & Crop", desc: "Trim & stitch clips ready to edit", href: "/dashboard/cut-and-crop", slug: "cut-and-crop", category: "video" },
  { title: "AI Creator", desc: "Become an AI content creator in 3 steps", href: "/dashboard/ai-creator", slug: "ai-creator", category: "video" },
  { title: "Reddit Story Videos", desc: "Turn Reddit posts into viral videos", href: "/dashboard/create/reddit-video", slug: "reddit-story-videos", category: "video" },
  { title: "Fake Texts Videos", desc: "Fake text-conversation story videos", href: "/dashboard/create/text-video", slug: "fake-texts-videos", category: "video" },
  { title: "Viral Split Screen", desc: "Gameplay split-screen that retains viewers", href: "/dashboard/create/viral-split-screen", slug: "viral-split-screen", category: "video" },
];

// AI tools (single-purpose generators / enhancers).
export const AI_TOOLS: FeatureLink[] = [
  { title: "AI Image Generator", desc: "High-quality AI images in seconds", href: "/dashboard/tools/image-generator", slug: "ai-image-generator", category: "ai" },
  { title: "AI Voiceover", desc: "Lifelike voiceovers · 50+ narrators", href: "/dashboard/tools/voiceover", slug: "ai-voiceover", category: "ai" },
  { title: "AI Video Generator", desc: "Generate AI videos with Google Veo3", href: "/dashboard/tools/video-generator", slug: "ai-video-generator", category: "ai" },
  { title: "AI Face Swap", desc: "Swap faces in photos & videos", href: "/dashboard/tools/face-swap", slug: "ai-face-swap", category: "ai" },
  { title: "Background Remover", desc: "Remove image / video backgrounds", href: "/dashboard/tools/background-remover", slug: "background-remover", category: "ai" },
  { title: "AI Voice Changer", desc: "Change any voice with AI", href: "/dashboard/tools/voice-changer", slug: "ai-voice-changer", category: "ai" },
  { title: "AI Vocal Remover", desc: "Strip vocals from audio or video", href: "/dashboard/tools/vocal-remover", slug: "ai-vocal-remover", category: "ai" },
  { title: "AI Speech Enhancer", desc: "Clean up & enhance any audio", href: "/dashboard/tools/enhance-speech", slug: "ai-speech-enhancer", category: "ai" },
  { title: "Subtitle Remover", desc: "Remove burned-in subtitles with AI", href: "/dashboard/tools/subtitle-remover", slug: "subtitle-remover", category: "ai" },
  { title: "AI Brainstormer", desc: "Viral content ideas for your niche", href: "/dashboard/tools/brainstormer", slug: "ai-brainstormer", category: "ai" },
];

/**
 * A resolved link ready to render. Tools become one of these via `toNavLink`
 * (public page) or `toAppNavLink` (in-app destination); RESOURCES already are.
 */
export interface NavLink {
  title: string;
  desc: string;
  href: string;
  external?: boolean;
}

// Resources (non-feature links shown in the navbar dropdown). These are already
// public pages, so they have no slug of their own.
export const RESOURCES: NavLink[] = [
  { title: "Affiliate Program", desc: "Earn 20% recurring on every paid referral", href: "/affiliate-program" },
  { title: "Community Discord", desc: "Get support & connect with fellow creators", href: "/discord", external: true },
];

/** Every tool, in the order the site presents them. */
export const ALL_TOOLS: FeatureLink[] = [...VIDEO_TOOLS, ...AI_TOOLS, ...FREE_FEATURES];

export const TOOLS_BY_CATEGORY: Record<ToolCategory, FeatureLink[]> = {
  video: VIDEO_TOOLS,
  ai: AI_TOOLS,
  free: FREE_FEATURES,
};

export function getToolBySlug(slug: string): FeatureLink | undefined {
  return ALL_TOOLS.find((tool) => tool.slug === slug);
}

/** The public marketing page for a tool. */
export function toolPath(tool: FeatureLink): string {
  return `/tools/${tool.slug}`;
}

/** For public surfaces — navbar, footer, homepage. Points at the marketing page. */
export function toNavLink(tool: FeatureLink): NavLink {
  return { title: tool.title, desc: tool.desc, href: toolPath(tool) };
}

/** For in-app surfaces — the dashboard header and command palette. */
export function toAppNavLink(tool: FeatureLink): NavLink {
  return { title: tool.title, desc: tool.desc, href: tool.href };
}

/**
 * Maps an in-app tool path back to its public page, so proxy.ts can send a
 * logged-out visitor to the marketing page instead of a bare login form.
 * Matches the longest href first — /dashboard/tools/free/audio-balancer must
 * not be shadowed by a shorter prefix.
 */
export function publicPathForAppPath(pathname: string): string | undefined {
  const match = [...ALL_TOOLS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((tool) => pathname === tool.href || pathname.startsWith(`${tool.href}/`));
  return match ? toolPath(match) : undefined;
}
