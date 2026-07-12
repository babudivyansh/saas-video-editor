import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const globalForRedis = globalThis as unknown as {
  redis: Redis;
  redisFallback: Map<string, { value: string; expiresAt: number | null }>;
};

// In-memory fallback used when Redis is unreachable (dev without Docker)
const fallback =
  globalForRedis.redisFallback ?? new Map<string, { value: string; expiresAt: number | null }>();
if (process.env.NODE_ENV !== "production") globalForRedis.redisFallback = fallback;

// Separate fallback store for counters (incrWithExpire) — kept apart from the
// string get/set map above since counters need numeric increment semantics.
const globalForCounters = globalThis as unknown as {
  redisCounterFallback: Map<string, { count: number; expiresAt: number }>;
};
const counterFallback =
  globalForCounters.redisCounterFallback ?? new Map<string, { count: number; expiresAt: number }>();
if (process.env.NODE_ENV !== "production") globalForCounters.redisCounterFallback = counterFallback;

function fallbackIncr(key: string, ttlSeconds: number): number {
  const now = Date.now();
  const entry = counterFallback.get(key);
  if (!entry || entry.expiresAt <= now) {
    counterFallback.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function fallbackGet(key: string): string | null {
  const entry = fallback.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    fallback.delete(key);
    return null;
  }
  return entry.value;
}
function fallbackSet(key: string, value: string, ttlSeconds?: number) {
  fallback.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}
function fallbackDel(key: string) {
  fallback.delete(key);
}

const isNewClient = !globalForRedis.redis;
const client =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL ?? "redis://localhost:6379", {
    // Looser than a local-dev Redis needs, since production talks to a remote
    // instance over the public internet (Hostinger -> Upstash) where a single
    // transient blip shouldn't immediately drop to the in-memory fallback.
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 5000,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = client;

if (isNewClient) {
  // Silence "unhandled error" events when Redis is offline in dev.
  client.on("error", () => {});
  // Eagerly open the connection at startup. With lazyConnect + a disabled
  // offline queue, the first command issued before the handshake completes
  // would fail straight into the in-memory fallback while later reads hit the
  // now-connected real Redis — so a session written at boot would "vanish".
  // Connecting up front (localhost is ~ms, far faster than route compile)
  // closes that race; if Redis is genuinely down, this rejects and commands
  // still fall back to the in-memory map as before.
  client.connect().catch(() => {});
}

// The fallback is per-process, so a write that lands there is invisible to a
// later read that reaches the real Redis — under sustained failure (e.g. an
// Upstash quota lockout rejecting writes while reads still work) every session
// written via cacheSession silently vanishes and all auth breaks with no error
// anywhere. Log the underlying Redis error so the outage is visible, but
// throttled to once a minute per operation to keep a hot path from flooding
// stdout/Sentry.
const lastFallbackLog = new Map<string, number>();
function logFallback(op: string, err: unknown) {
  const now = Date.now();
  const last = lastFallbackLog.get(op) ?? 0;
  if (now - last < 60_000) return;
  lastFallbackLog.set(op, now);
  logger.error("redis", `${op} failed, using in-memory fallback (throttled: at most one log/min per op)`, err);
}

// Thin wrapper that transparently falls back to in-memory when Redis is down
export const redis = {
  async get(key: string): Promise<string | null> {
    try {
      return await client.get(key);
    } catch (err) {
      logFallback("GET", err);
      return fallbackGet(key);
    }
  },
  async set(key: string, value: string, ex?: "EX", ttl?: number): Promise<void> {
    try {
      if (ex === "EX" && ttl) await client.set(key, value, "EX", ttl);
      else await client.set(key, value);
    } catch (err) {
      logFallback("SET", err);
      fallbackSet(key, value, ttl);
    }
  },
  async del(key: string): Promise<void> {
    try {
      await client.del(key);
    } catch (err) {
      logFallback("DEL", err);
      fallbackDel(key);
    }
  },
  /**
   * Atomically increments a counter and returns its new value, setting a TTL
   * the first time the key is created (fixed-window counter). Used for rate
   * limiting — a small race on the very first increment (INCR then EXPIRE,
   * not a single atomic op) is an accepted tradeoff for a rate limiter.
   */
  async incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
    try {
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, ttlSeconds);
      return count;
    } catch (err) {
      logFallback("INCR", err);
      return fallbackIncr(key, ttlSeconds);
    }
  },
  /**
   * Real connectivity check with no in-memory fallback — used by the health
   * endpoint. Every other method above intentionally swallows a down Redis
   * into the fallback map, which would make a health check lie about an
   * actual outage. Probes with a real SET, not PING: a write-locked instance
   * (e.g. Upstash free-tier quota lockout) answers PING fine while rejecting
   * every write, which once let /api/health report a healthy Redis during a
   * total auth outage (sessions could never be stored).
   */
  async ping(): Promise<boolean> {
    try {
      await client.set("health:write-probe", "1", "EX", 60);
      return true;
    } catch {
      return false;
    }
  },
};
