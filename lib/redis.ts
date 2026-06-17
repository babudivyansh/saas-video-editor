import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis;
  redisFallback: Map<string, { value: string; expiresAt: number | null }>;
};

// In-memory fallback used when Redis is unreachable (dev without Docker)
const fallback =
  globalForRedis.redisFallback ?? new Map<string, { value: string; expiresAt: number | null }>();
if (process.env.NODE_ENV !== "production") globalForRedis.redisFallback = fallback;

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
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2000,
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

// Thin wrapper that transparently falls back to in-memory when Redis is down
export const redis = {
  async get(key: string): Promise<string | null> {
    try {
      return await client.get(key);
    } catch {
      return fallbackGet(key);
    }
  },
  async set(key: string, value: string, ex?: "EX", ttl?: number): Promise<void> {
    try {
      if (ex === "EX" && ttl) await client.set(key, value, "EX", ttl);
      else await client.set(key, value);
    } catch {
      fallbackSet(key, value, ttl);
    }
  },
  async del(key: string): Promise<void> {
    try {
      await client.del(key);
    } catch {
      fallbackDel(key);
    }
  },
};
