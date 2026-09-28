import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return "OK"; }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => { store.delete(k); return 1; }),
  },
}));

const { savePendingSignup, readPendingSignup, hasPendingSignup } = await import("./signup-pending");

const victim = { name: "Victim", passwordHash: "victim-hash", referralCode: null };
const attacker = { name: "Attacker", passwordHash: "attacker-hash", referralCode: null };

describe("pending signup", () => {
  it("only hands the record back to the browser holding its token", async () => {
    const token = await savePendingSignup("v@x.com", victim);
    expect(await readPendingSignup("v@x.com", token)).toEqual(victim);
    expect(await readPendingSignup("v@x.com", "guess")).toBeNull();
    expect(await readPendingSignup("v@x.com", undefined)).toBeNull();
  });

  it("a second signup for the same address can't be completed with the first browser's token", async () => {
    const victimToken = await savePendingSignup("v2@x.com", victim);
    const attackerToken = await savePendingSignup("v2@x.com", attacker);
    expect(attackerToken).not.toBe(victimToken);
    // The victim, who types the emailed code, never gets the attacker's hash.
    expect(await readPendingSignup("v2@x.com", victimToken)).toBeNull();
    expect(await hasPendingSignup("v2@x.com")).toBe(true);
  });
});
