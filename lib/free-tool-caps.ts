// Daily usage caps for the zero-credit "free tools" (2026-07 pricing audit).
// These tools cost no credits, so before this cap they were unbounded
// FFmpeg/downloader compute for scrapers. Caps are per user per rolling day;
// generous enough that a real user never notices.
//
// Enforced in each tool route via checkFreeToolDailyCap() below, which wraps
// lib/rate-limit's fixed-window Redis counter with an 86400s window.

import { rateLimit } from "@/lib/rate-limit";

export const FREE_TOOL_DAILY_CAPS: Record<string, number> = {
  "audio-balancer": 10,
  "mp3-converter": 15,
  "video-compressor": 10,
  "youtube-downloader": 25,
  "instagram-downloader": 25,
};

export async function checkFreeToolDailyCap(
  toolSlug: string,
  key: string, // userId, or client IP for anonymous tools
): Promise<{ allowed: boolean; remaining: number; cap: number }> {
  const cap = FREE_TOOL_DAILY_CAPS[toolSlug] ?? Infinity;
  if (!Number.isFinite(cap)) return { allowed: true, remaining: Infinity, cap };
  const { allowed, remaining } = await rateLimit(`freetool:${toolSlug}:${key}`, cap, 86400);
  return { allowed, remaining, cap };
}

export function freeToolCapResponseBody(toolSlug: string, cap: number) {
  return {
    error: "daily_limit_reached",
    message: `You've hit today's free limit for this tool (${cap} uses). It resets within 24 hours — or upgrade for unlimited access.`,
    toolSlug,
    cap,
    upgradeUrl: "/pricing",
  };
}
