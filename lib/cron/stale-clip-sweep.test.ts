import { beforeEach, describe, expect, it, vi } from "vitest";

let updateManyArgs: { where: unknown; data: unknown } | null = null;
let updateManyCount = 0;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clip: {
      updateMany: vi.fn(async (args: { where: unknown; data: unknown }) => {
        updateManyArgs = args;
        return { count: updateManyCount };
      }),
    },
  },
}));

const { runStaleClipSweep, STALE_CLIP_TIMEOUT_MINUTES } = await import("./stale-clip-sweep");

beforeEach(() => {
  updateManyArgs = null;
  updateManyCount = 0;
  vi.clearAllMocks();
});

describe("runStaleClipSweep", () => {
  it("flips clips stuck at queued/rendering past the timeout to failed", async () => {
    updateManyCount = 3;
    const before = Date.now();
    const result = await runStaleClipSweep();
    expect(result).toEqual({ ok: true, swept: 3, at: expect.any(String) });
    expect(new Date(result.at).getTime()).toBeGreaterThanOrEqual(before);

    expect(updateManyArgs).not.toBeNull();
    const { where, data } = updateManyArgs as { where: { status: { in: string[] }; updatedAt: { lt: Date } }; data: { status: string } };
    expect(where.status).toEqual({ in: ["queued", "rendering"] });
    expect(data).toEqual({ status: "failed" });

    // Cutoff should be STALE_CLIP_TIMEOUT_MINUTES ago, not some other window.
    const expectedCutoff = Date.now() - STALE_CLIP_TIMEOUT_MINUTES * 60 * 1000;
    expect(Math.abs(where.updatedAt.lt.getTime() - expectedCutoff)).toBeLessThan(2000);
  });

  it("reports zero swept when nothing is stale", async () => {
    updateManyCount = 0;
    const result = await runStaleClipSweep();
    expect(result.swept).toBe(0);
  });
});
