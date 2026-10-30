import { beforeEach, describe, expect, it, vi } from "vitest";

const counts = new Map<string, number>();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, max: number) => {
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return { allowed: n <= max, remaining: Math.max(0, max - n) };
  }),
}));

const { localRenderCredits, PAID_FREE_RENDERS_PER_DAY, EXPORT_4K_CREDIT_COST, LOCAL_RENDER_CREDIT_COST } = await import("./render-pricing");

beforeEach(() => counts.clear());

describe("localRenderCredits", () => {
  it("charges the free plan a credit per render", async () => {
    expect(await localRenderCredits("u1", "free")).toBe(LOCAL_RENDER_CREDIT_COST);
  });

  it("is free on any paid plan up to the daily allowance, then a credit", async () => {
    for (let i = 0; i < PAID_FREE_RENDERS_PER_DAY; i++) {
      expect(await localRenderCredits("u1", "lite")).toBe(0);
    }
    expect(await localRenderCredits("u1", "lite")).toBe(LOCAL_RENDER_CREDIT_COST);
  });

  it("always charges 4K at its own price, without using the allowance", async () => {
    expect(await localRenderCredits("u1", "pro", { is4k: true })).toBe(EXPORT_4K_CREDIT_COST);
    expect(counts.size).toBe(0);
  });
});
