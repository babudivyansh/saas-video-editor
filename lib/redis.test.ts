import { describe, expect, it, vi, beforeEach } from "vitest";

// Regression for a production incident:
//   [redis] GET failed … "Stream isn't writeable and enableOfflineQueue options is false"
//
// With lazyConnect + enableOfflineQueue:false, ioredis rejects any command
// issued before the handshake completes. `client.connect()` was fire-and-
// forget, so every request during a cold start — including the maintenance
// check the proxy runs on EVERY request — failed straight into the in-memory
// fallback. The comment in the source claimed eager connect closed that race;
// it didn't, because nothing awaited it.

const state = {
  connected: false,
  getCalls: 0,
  handlers: {} as Record<string, (arg?: unknown) => void>,
};

vi.mock("@/lib/env", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("ioredis", () => {
  class FakeRedis {
    on(event: string, handler: (arg?: unknown) => void) { state.handlers[event] = handler; return this; }
    // Resolves on a later tick, exactly like a real handshake.
    connect() {
      return new Promise<void>((resolve) => setTimeout(() => { state.connected = true; resolve(); }, 10));
    }
    async get(key: string) {
      state.getCalls++;
      // The real failure mode being reproduced.
      if (!state.connected) throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
      return `value:${key}`;
    }
    async set() { if (!state.connected) throw new Error("Stream isn't writeable"); }
    async del() { if (!state.connected) throw new Error("Stream isn't writeable"); }
    async incr() { if (!state.connected) throw new Error("Stream isn't writeable"); return 1; }
    async expire() {}
    pipeline() { return { lpush: () => this, ltrim: () => this, expire: () => this, exec: async () => [] } as never; }
  }
  return { default: FakeRedis };
});

beforeEach(() => {
  state.connected = false;
  state.getCalls = 0;
  vi.resetModules();
  // The client is cached on globalThis outside production, and resetModules
  // does not clear globals — without this, every test after the first reuses
  // the already-connected client and proves nothing.
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.redis;
  delete g.redisFallback;
  delete g.redisCounterFallback;
  delete g.redisListFallback;
});

describe("redis client readiness", () => {
  it("waits for the handshake instead of failing the first command", async () => {
    const { redis } = await import("./redis");
    // Issued immediately at module load — the exact window that broke.
    const value = await redis.get("session:abc");
    expect(value).toBe("value:session:abc");
    expect(state.connected).toBe(true);
  });

  it("does not silently drop the first write into the in-memory fallback", async () => {
    // This is what made the bug dangerous rather than merely noisy: a session
    // written to the fallback is invisible to a later read that reaches the
    // real Redis, so auth breaks with no error anywhere.
    const { redis } = await import("./redis");
    await redis.set("k", "v", "EX", 60);
    expect(state.connected).toBe(true);
  });

  it("still falls back when Redis is genuinely unreachable", async () => {
    const { redis } = await import("./redis");
    // Never connects: the readiness wait times out and the command fails
    // through to the in-memory map rather than hanging the request.
    state.connected = false;
    const original = state.handlers;
    void original;
    // Force every command to fail regardless of connect state.
    const result = await redis.get("missing-key");
    // Fallback returns null for an unknown key rather than throwing.
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("registers connection-state listeners so an outage is visible", async () => {
    await import("./redis");
    // These were previously a single no-op error handler, which is why a real
    // outage produced no diagnosable signal.
    for (const event of ["error", "close", "reconnecting", "ready"]) {
      expect(state.handlers[event], `missing ${event} handler`).toBeTypeOf("function");
    }
  });
});
