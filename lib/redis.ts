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

// Fallback store for list ops (metrics ring buffers), kept separate from the
// string and counter maps for the same reason those are separate from each
// other: different value shapes, different lifetimes.
const globalForLists = globalThis as unknown as { redisListFallback: Map<string, string[]> };
const listFallback = globalForLists.redisListFallback ?? new Map<string, string[]>();
globalForLists.redisListFallback = listFallback;
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

// Resolves once the initial handshake has settled, either way.
//
// `client.connect()` was previously fire-and-forget, so despite the comment
// below claiming the race was closed, ANY command issued between module
// evaluation and the completed handshake still failed instantly with
// "Stream isn't writeable and enableOfflineQueue options is false" and dropped
// to the in-memory fallback. On a cold start that is every early request —
// including the maintenance-mode check the proxy runs on every single one.
// Awaiting this before the first command closes the race for real.
let connectSettled: Promise<void> = Promise.resolve();

// Connection-state visibility. `client.on("error", () => {})` silenced every
// Redis error, so a real outage — wrong URL, TLS mismatch, quota lockout,
// connection limit — was indistinguishable from a working cache, and the only
// symptom was the throttled per-command log with no underlying cause. These
// log each transition once so the next incident says what actually happened.
let lastState = "";
function logState(state: string, detail?: unknown) {
  if (state === lastState) return;
  lastState = state;
  if (state === "ready") logger.info("redis", "connected");
  else logger.error("redis", `connection ${state}`, detail);
}

if (isNewClient) {
  // Still swallow the event itself (an unhandled 'error' would crash the
  // process), but no longer silently.
  client.on("error", (err) => logState("error", err));
  client.on("close", () => logState("closed"));
  client.on("reconnecting", () => logState("reconnecting"));
  client.on("ready", () => logState("ready"));

  // Eagerly open the connection at startup. If Redis is genuinely down this
  // rejects and commands fall back to the in-memory map as before.
  connectSettled = client.connect().then(() => {}, () => {});
}

/**
 * Await the initial handshake before issuing a command.
 *
 * Bounded: a Redis that never comes up must not hold requests open. After the
 * first settle this is an already-resolved promise, so the cost is one
 * microtask.
 */
async function ready(): Promise<void> {
  try {
    await Promise.race([
      connectSettled,
      new Promise<void>((resolve) => setTimeout(resolve, 2000).unref?.()),
    ]);
  } catch { /* fall through to the command, which will use the fallback */ }
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
      await ready();
      return await client.get(key);
    } catch (err) {
      logFallback("GET", err);
      return fallbackGet(key);
    }
  },
  async set(key: string, value: string, ex?: "EX", ttl?: number): Promise<void> {
    try {
      await ready();
      if (ex === "EX" && ttl) await client.set(key, value, "EX", ttl);
      else await client.set(key, value);
    } catch (err) {
      logFallback("SET", err);
      fallbackSet(key, value, ttl);
    }
  },
  async del(key: string): Promise<void> {
    try {
      await ready();
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
      await ready();
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, ttlSeconds);
      return count;
    } catch (err) {
      logFallback("INCR", err);
      return fallbackIncr(key, ttlSeconds);
    }
  },
  // ── List ops ──────────────────────────────────────────────────────────
  // Used by lib/pipeline-metrics.ts for bounded ring buffers of stage
  // samples. The in-memory fallback keeps the same shape so a Redis outage
  // degrades metrics rather than breaking the pipeline that emits them.
  async lpush(key: string, value: string): Promise<void> {
    try {
      await ready();
      await client.lpush(key, value);
    } catch (err) {
      logFallback("LPUSH", err);
      const list = listFallback.get(key) ?? [];
      list.unshift(value);
      listFallback.set(key, list);
    }
  },
  /**
   * Push onto a capped ring buffer in ONE round trip.
   *
   * LPUSH + LTRIM + EXPIRE as three separate awaits costs three round trips
   * and three commands per sample, which on a metered/remote Redis is three
   * times the load for no benefit — they always occur together.
   */
  async pipelineRingPush(key: string, value: string, maxLen: number, ttlSeconds: number): Promise<void> {
    try {
      await ready();
      await client.pipeline()
        .lpush(key, value)
        .ltrim(key, 0, maxLen - 1)
        .expire(key, ttlSeconds)
        .exec();
    } catch (err) {
      logFallback("PIPELINE", err);
      const list = listFallback.get(key) ?? [];
      list.unshift(value);
      listFallback.set(key, list.slice(0, maxLen));
    }
  },
  async ltrim(key: string, start: number, stop: number): Promise<void> {
    try {
      await ready();
      await client.ltrim(key, start, stop);
    } catch (err) {
      logFallback("LTRIM", err);
      const list = listFallback.get(key);
      if (list) listFallback.set(key, list.slice(start, stop + 1));
    }
  },
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      await ready();
      return await client.lrange(key, start, stop);
    } catch (err) {
      logFallback("LRANGE", err);
      return (listFallback.get(key) ?? []).slice(start, stop + 1);
    }
  },
  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await ready();
      await client.expire(key, ttlSeconds);
    } catch (err) {
      logFallback("EXPIRE", err);
      // The fallback map is process-local and short-lived anyway.
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
