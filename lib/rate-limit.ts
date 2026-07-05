import { redis } from "./redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
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
