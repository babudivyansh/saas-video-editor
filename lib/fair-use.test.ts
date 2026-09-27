import { beforeEach, describe, expect, it, vi } from "vitest";

const counts = new Map<string, number>();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, max: number) => {
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return { allowed: n <= max, remaining: Math.max(0, max - n) };
  }),
}));

const { takeFairUse, FAIR_USE_PER_DAY, isFreeTextTool } = await import("./fair-use");

describe("fair-use caps for the free text tools", () => {
  beforeEach(() => counts.clear());

  it("gives free accounts a small daily allowance, then refuses with an upgrade hint", async () => {
    for (let i = 0; i < FAIR_USE_PER_DAY.free; i++) {
      expect((await takeFairUse("u1", "brainstormer", "free")).allowed).toBe(true);
    }
    const r = await takeFairUse("u1", "brainstormer", "free");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.message).toMatch(/Upgrade/);
  });

  it("gives paid plans the larger allowance", async () => {
    for (let i = 0; i < FAIR_USE_PER_DAY.paid; i++) {
      expect((await takeFairUse("u2", "editor-ai-text", "creator")).allowed).toBe(true);
    }
    expect((await takeFairUse("u2", "editor-ai-text", "creator")).allowed).toBe(false);
  });

  it("counts each tool and each user separately", async () => {
    for (let i = 0; i < FAIR_USE_PER_DAY.free; i++) await takeFairUse("u3", "brainstormer", "free");
    expect((await takeFairUse("u3", "social-caption", "free")).allowed).toBe(true);
    expect((await takeFairUse("u4", "brainstormer", "free")).allowed).toBe(true);
  });

  it("knows which tools are free text tools", () => {
    expect(isFreeTextTool("social-caption")).toBe(true);
    expect(isFreeTextTool("social-exec-report")).toBe(false);
  });
});
