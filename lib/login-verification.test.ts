import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return "OK"; }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => { store.delete(k); return 1; }),
  },
}));

const { markPasswordProven, takePasswordProven } = await import("./login-verification");

describe("password-proven marker", () => {
  it("is honoured once, for the client that proved the password", async () => {
    const proof = await markPasswordProven("a@x.com", "u1");
    expect(await takePasswordProven("a@x.com", "u1", proof)).toBe(true);
    expect(await takePasswordProven("a@x.com", "u1", proof)).toBe(false);
  });

  it("a code-only login elsewhere can't ride on someone else's password proof", async () => {
    await markPasswordProven("b@x.com", "u2");
    expect(await takePasswordProven("b@x.com", "u2", undefined)).toBe(false);
    expect(await takePasswordProven("b@x.com", "u2", "forged")).toBe(false);
  });

  it("doesn't cross users", async () => {
    const proof = await markPasswordProven("c@x.com", "u3");
    expect(await takePasswordProven("c@x.com", "other", proof)).toBe(false);
  });
});
