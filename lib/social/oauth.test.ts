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
    getdel: vi.fn(async (key: string) => {
      const v = store.get(key) ?? null;
      store.delete(key);
      return v;
    }),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const { createState, consumeState, makePkce, stateClient, parkAppConnect, takeAppConnect } = await import("./oauth");

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
    const { state, nonce } = await createState("user-1", "instagram", verifier);
    const out = await consumeState(state, nonce);
    expect(out).toEqual({ userId: "user-1", provider: "instagram", verifier, client: "web" });
  });

  it("remembers a connect started in the phone app", async () => {
    const { verifier } = makePkce();
    const { state } = await createState("user-1", "youtube", verifier, "app");
    expect(stateClient(state)).toBe("app");
    // No browser cookie: the app's connect is bound by its session at completion instead.
    expect(await consumeState(state, undefined)).toMatchObject({ userId: "user-1", client: "app" });
  });

  it("only a validly signed state can send the browser to the app", async () => {
    expect(stateClient(null)).toBe("web");
    expect(stateClient(jwt.sign({ userId: "u", provider: "youtube", nonce: "n", client: "app" }, "wrong-secret"))).toBe("web");
    const { verifier } = makePkce();
    expect(stateClient((await createState("user-1", "youtube", verifier)).state)).toBe("web");
  });

  it("is single-use: a replayed state is rejected", async () => {
    const { verifier } = makePkce();
    const { state, nonce } = await createState("user-1", "youtube", verifier);
    expect(await consumeState(state, nonce)).not.toBeNull();
    expect(await consumeState(state, nonce)).toBeNull();
  });

  it("rejects a tampered state JWT", async () => {
    const { verifier } = makePkce();
    const { state, nonce } = await createState("user-1", "youtube", verifier);
    const tampered = state.slice(0, -2) + "xx";
    expect(await consumeState(tampered, nonce)).toBeNull();
  });

  it("rejects a state signed with a different secret", async () => {
    const forged = jwt.sign({ userId: "victim", provider: "youtube", nonce: "abc" }, "wrong-secret");
    expect(await consumeState(forged, "abc")).toBeNull();
  });
});

describe("browser binding", () => {
  it("refuses a web state in a browser without the matching nonce cookie, and leaves it unspent", async () => {
    const { verifier } = makePkce();
    const { state, nonce } = await createState("attacker", "youtube", verifier);
    // The attacker's link opened in the victim's browser: no cookie, or the victim's own.
    expect(await consumeState(state, undefined)).toBeNull();
    expect(await consumeState(state, "0".repeat(nonce.length))).toBeNull();
    expect(await consumeState(state, "short")).toBeNull();
    // The browser that started it can still finish it.
    expect(await consumeState(state, nonce)).toMatchObject({ userId: "attacker" });
  });

  it("parks a phone connect for one taker", async () => {
    const id = await parkAppConnect({ userId: "u1", provider: "youtube", oauthProvider: "youtube", code: "c", verifier: "v" });
    expect(id).toMatch(/^[\w-]{32}$/);
    expect(await takeAppConnect(id)).toEqual({ userId: "u1", provider: "youtube", oauthProvider: "youtube", code: "c", verifier: "v" });
    expect(await takeAppConnect(id)).toBeNull();
  });
});
