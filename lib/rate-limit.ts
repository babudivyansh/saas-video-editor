import { NextRequest } from "next/server";
import { redis } from "./redis";
import { env } from "@/lib/env";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Client IP for rate-limit keying (best-effort — not for fraud/trust decisions).
 *
 * Reverse proxies APPEND the connecting IP to X-Forwarded-For, so the
 * client-controlled (spoofable) values sit on the LEFT and the
 * trusted-proxy-provided ones on the right. Taking `xff.split(",")[0]` trusted
 * the leftmost value, which a client can forge to evade every IP-keyed limit.
 * Count `TRUSTED_PROXY_COUNT` hops in from the right instead (default 1, i.e. a
 * single reverse proxy such as Hostinger's LiteSpeed).
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const hops = Math.max(1, parseInt(env.TRUSTED_PROXY_COUNT || "1", 10) || 1);
      return parts[Math.max(0, parts.length - hops)];
    }
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Fixed-window rate limiter. Returns whether this call is allowed under `max`
 * attempts per `windowSeconds`, keyed by `key`. Every call counts (including
 * ones that turn out to be rejected by the caller for other reasons) — call
 * this first and short-circuit before doing any real work once `allowed` is
 * false.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const count = await redis.incrWithExpire(`ratelimit:${key}`, windowSeconds);
  return { allowed: count <= max, remaining: Math.max(0, max - count) };
}

/**
 * Hands back one slot taken by rateLimit() for a request that did not go
 * ahead. For QUOTAS rather than abuse limits — e.g. the free tier's monthly
 * AutoClip runs, where a run refused for being a double-submit, or for lack of
 * credits, must not count as one of the user's free videos. Consuming first
 * and giving back on failure (rather than checking, then consuming) keeps two
 * concurrent requests from both slipping under the limit.
 */
export async function releaseRateLimit(key: string): Promise<void> {
  await redis.decrFloor(`ratelimit:${key}`);
}
