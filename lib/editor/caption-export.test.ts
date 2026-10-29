// Settling a Caption Studio export batch: once, after the last ratio ends;
// refunded only when nothing rendered.

import { describe, expect, it, vi, beforeEach } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const restoreSpend = vi.hoisted(() => vi.fn(async () => 1));
const notify = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectRender: { findMany, updateMany },
    project: { findUnique: vi.fn(async () => ({ title: "Founder story" })) },
  },
}));
vi.mock("@/lib/credits", () => ({ restoreSpend }));
vi.mock("@/lib/notify", () => ({ notify }));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn() }));
vi.mock("./render-job", () => ({ renderTimeline: vi.fn(), EDITOR_RENDER_CREDIT_COST: 1 }));

const { settleBatchIfDone, docForAspect } = await import("./caption-export");

const row = (status: string) => ({ status, projectId: "p1", userId: "u1" });

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 3 });
});

describe("settleBatchIfDone", () => {
  it("waits while any ratio is still queued or rendering", async () => {
    findMany.mockResolvedValue([row("completed"), row("rendering")]);
    expect(await settleBatchIfDone("b1")).toBe("pending");
    expect(updateMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("refunds the batch when nothing rendered", async () => {
    findMany.mockResolvedValue([row("failed"), row("failed")]);
    expect(await settleBatchIfDone("b1")).toBe("settled");
    expect(restoreSpend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", refId: "caption-export:b1", amount: 1 }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "editor_export_failed" }));
  });

  it("keeps the charge when at least one ratio rendered", async () => {
    findMany.mockResolvedValue([row("completed"), row("failed")]);
    await settleBatchIfDone("b1");
    expect(restoreSpend).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "editor_export_complete", body: expect.stringContaining("1 of 2") }));
  });

  it("settles once: a second finisher finds the claim taken", async () => {
    findMany.mockResolvedValue([row("failed")]);
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await settleBatchIfDone("b1")).toBe("settled");
    expect(await settleBatchIfDone("b1")).toBe("already");
    expect(restoreSpend).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({ where: { batchId: "b1", settledAt: null }, data: { settledAt: expect.any(Date) } });
  });
});

describe("docForAspect", () => {
  const doc = { version: 1, aspect: "9:16", fps: 30, tracks: { video: [], text: [], audio: [], image: [], caption: [] } } as const;
  it("swaps the frame and leaves the rest", () => {
    expect(docForAspect(doc as never, "16:9")).toEqual({ ...doc, aspect: "16:9" });
    expect(docForAspect(doc as never, "original", { w: 1920, h: 1080 })).toEqual({ ...doc, aspect: "original", size: { w: 1920, h: 1080 } });
  });
});
