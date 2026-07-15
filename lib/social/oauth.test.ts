import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

// lib/env.ts validates the full production env at import time; this unit test
// only needs the fields oauth.ts reads, so mock the module instead of faking
// every required variable.
vi.mock("@/lib/env", () => ({
  env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

// In-memory stand-in for the Redis-backed PKCE verifier store.
let store: Map<string, string>;

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const { createState, consumeState, makePkce } = await import("./oauth");

beforeEach(() => {
  store = new Map();
});

describe("makePkce", () => {
  it("derives the challenge from the verifier (S256)", () => {
    const { verifier, challenge } = makePkce();
    expect(verifier).not.toEqual(challenge);
    expect(verifier.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(challenge).toMatch(/^[\w-]+$/);
  });
});

describe("state round-trip", () => {
  it("returns the userId, provider and verifier that went in", async () => {
    const { verifier } = makePkce();
    const state = await createState("user-1", "instagram", verifier);
    const out = await consumeState(state);
    expect(out).toEqual({ userId: "user-1", provider: "instagram", verifier });
  });

  it("is single-use: a replayed state is rejected", async () => {
    const { verifier } = makePkce();
    const state = await createState("user-1", "youtube", verifier);
    expect(await consumeState(state)).not.toBeNull();
    expect(await consumeState(state)).toBeNull();
  });

  it("rejects a tampered state JWT", async () => {
    const { verifier } = makePkce();
    const state = await createState("user-1", "youtube", verifier);
    const tampered = state.slice(0, -2) + "xx";
    expect(await consumeState(tampered)).toBeNull();
  });

  it("rejects a state signed with a different secret", async () => {
    const forged = jwt.sign({ userId: "victim", provider: "youtube", nonce: "abc" }, "wrong-secret");
    expect(await consumeState(forged)).toBeNull();
  });
});
