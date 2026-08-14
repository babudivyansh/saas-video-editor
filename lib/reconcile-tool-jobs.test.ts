import { beforeEach, describe, expect, it, vi } from "vitest";

let generations: Array<{ id: string; userId: string; creditsCost: number }> = [];
let findManyArgs: unknown = null;
const refunds: Array<{ userId: string; amount: number; generationId?: string }> = [];
const marks: Array<{ id: string; status: string }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generation: {
      findMany: vi.fn(async (args: unknown) => {
        findManyArgs = args;
        return generations;
      }),
    },
  },
}));

vi.mock("@/lib/credits", () => ({
  refundCredits: vi.fn(async (p: { userId: string; amount: number; generationId?: string }) => {
    refunds.push(p);
  }),
  markGenerationStatus: vi.fn(async (id: string, status: string) => {
    marks.push({ id, status });
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { reconcileOrphanedToolJobs, STALE_TOOL_JOB_MINUTES } = await import("./reconcile-tool-jobs");

beforeEach(() => {
  generations = [];
  findManyArgs = null;
  refunds.length = 0;
  marks.length = 0;
  vi.clearAllMocks();
});

describe("reconcileOrphanedToolJobs", () => {
  it("only looks at pending, non-cancelled Generations older than the cutoff", async () => {
    await reconcileOrphanedToolJobs();
    const args = findManyArgs as { where: { status: string; cancelledAt: null; createdAt: { lt: Date } } };
    expect(args.where.status).toBe("pending");
    expect(args.where.cancelledAt).toBeNull();
    const expected = Date.now() - STALE_TOOL_JOB_MINUTES * 60 * 1000;
    expect(Math.abs(args.where.createdAt.lt.getTime() - expected)).toBeLessThan(2000);
  });

  it("refunds and fails each orphaned job", async () => {
    generations = [
      { id: "g1", userId: "u1", creditsCost: 3 },
      { id: "g2", userId: "u2", creditsCost: 6 },
    ];
    const n = await reconcileOrphanedToolJobs();
    expect(n).toBe(2);
    expect(refunds).toEqual([
      { userId: "u1", amount: 3, generationId: "g1" },
      { userId: "u2", amount: 6, generationId: "g2" },
    ]);
    expect(marks).toEqual([
      { id: "g1", status: "failed" },
      { id: "g2", status: "failed" },
    ]);
  });

  it("marks a zero-cost job failed without refunding", async () => {
    generations = [{ id: "g3", userId: "u3", creditsCost: 0 }];
    const n = await reconcileOrphanedToolJobs();
    expect(n).toBe(1);
    expect(refunds).toEqual([]);
    expect(marks).toEqual([{ id: "g3", status: "failed" }]);
  });

  it("does nothing when there are no orphaned jobs", async () => {
    const n = await reconcileOrphanedToolJobs();
    expect(n).toBe(0);
    expect(refunds).toEqual([]);
    expect(marks).toEqual([]);
  });
});
