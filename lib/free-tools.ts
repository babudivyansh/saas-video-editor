// The zero-credit "free tools" and their per-user daily caps (2026-07 pricing
// audit; the downloaders joined on 2026-10-30). A plain module with no server
// imports, so client components and marketing pages can read it too; the
// enforcement lives in lib/free-tool-caps.ts.

export const FREE_TOOL_DAILY_CAPS: Record<string, number> = {
  "audio-balancer": 10,
  "mp3-converter": 15,
  "video-compressor": 10,
  "youtube-downloader": 25,
  "instagram-downloader": 25,
};

/** True for a tool that never spends credits (it has a daily cap instead). */
export function isFreeTool(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(FREE_TOOL_DAILY_CAPS, slug);
}
