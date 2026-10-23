// Daily usage caps for the zero-credit "free tools" (2026-07 pricing audit).
// These tools cost no credits, so before this cap they were unbounded
// FFmpeg/downloader compute for scrapers. Caps are per user per rolling day;
// generous enough that a real user never notices.
//
// Enforced in each tool route via checkFreeToolDailyCap() below, which wraps
// lib/rate-limit's fixed-window Redis counter with an 86400s window.

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthUser, type TokenPayload } from "@/lib/auth";
import { getToolConfig } from "@/lib/tool-config";

export const FREE_TOOL_DAILY_CAPS: Record<string, number> = {
  "audio-balancer": 10,
  "mp3-converter": 15,
  "video-compressor": 10,
  "youtube-downloader": 25,
  "instagram-downloader": 25,
};

/** Extra per-hour limit for callers with no session, keyed by IP. */
const ANONYMOUS_PER_HOUR = 5;

export async function checkFreeToolDailyCap(
  toolSlug: string,
  key: string, // userId, or client IP for anonymous tools
): Promise<{ allowed: boolean; remaining: number; cap: number }> {
  const cap = FREE_TOOL_DAILY_CAPS[toolSlug] ?? Infinity;
  if (!Number.isFinite(cap)) return { allowed: true, remaining: Infinity, cap };
  const { allowed, remaining } = await rateLimit(`freetool:${toolSlug}:${key}`, cap, 86400);
  return { allowed, remaining, cap };
}

// `error` is what every tool screen displays, so it is the sentence — it used
// to be the code "daily_limit_reached", shown to users verbatim. It also used
// to promise "upgrade for unlimited access", which no plan gives.
export function freeToolCapResponseBody(toolSlug: string, cap: number) {
  return {
    error: `You've used today's ${cap} free uses of this tool. The limit resets within 24 hours.`,
    code: "daily_limit_reached",
    toolSlug,
    cap,
  };
}

/**
 * Everything a free tool route checks before reading its upload: the admin
 * kill switch (these routes never called getToolConfig, so disabling one in
 * /admin did nothing), a per-hour IP limit for anonymous callers, and the
 * daily cap — per USER when signed in. Every cap used to be keyed by IP even
 * for signed-in users, so people behind one office, campus or carrier NAT
 * shared a single allowance. Returns the caller's session, or the response to
 * return as-is.
 */
// Logged-out jobs across ALL addresses, per minute. The per-IP limit above
// means nothing to someone rotating addresses, and each of these is an ffmpeg
// transcode on the web server itself. Signed-in users are never counted here.
export const ANONYMOUS_SITEWIDE_PER_MINUTE = 20;

export async function freeToolGate(
  req: NextRequest,
  toolSlug: string,
): Promise<{ auth: TokenPayload | null } | NextResponse> {
  const cfg = await getToolConfig(toolSlug);
  if (!cfg.enabled) {
    return NextResponse.json({ error: "This tool is temporarily disabled. Please try again later." }, { status: 503 });
  }

  const auth = await getAuthUser(req);
  const ip = getClientIp(req);
  if (!auth) {
    const hourly = await rateLimit(`${toolSlug}:ip:${ip}`, ANONYMOUS_PER_HOUR, 3600);
    if (!hourly.allowed) {
      return NextResponse.json({ error: "Too many requests — sign in, or try again in an hour." }, { status: 429 });
    }
    const sitewide = await rateLimit("free-tools:anonymous:all", ANONYMOUS_SITEWIDE_PER_MINUTE, 60);
    if (!sitewide.allowed) {
      return NextResponse.json({ error: "The free tools are busy right now. Sign in to skip the queue, or try again in a minute." }, { status: 503 });
    }
  }

  const daily = await checkFreeToolDailyCap(toolSlug, auth ? `user:${auth.userId}` : `ip:${ip}`);
  if (!daily.allowed) return NextResponse.json(freeToolCapResponseBody(toolSlug, daily.cap), { status: 429 });

  return { auth };
}
