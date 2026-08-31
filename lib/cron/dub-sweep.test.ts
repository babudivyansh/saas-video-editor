import { beforeEach, describe, expect, it, vi } from "vitest";

let inFlightDubs: Array<{
  id: string;
  dubbingId: string | null;
  userId: string | null;
  refId: string | null;
  createdAt: Date;
  clip: { projectId: string };
}> = [];
const dubUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
const restoreSpendCalls: Array<{ userId: string; refId: string; reason?: string }> = [];
const claimAndEnqueueFinishCalls: unknown[] = [];
let claimAndEnqueueFinishReturns = true;
let statusByDubbingId: Record<string, "dubbing" | "dubbed" | "failed" | Error> = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipDub: {
      findMany: vi.fn(async () => inFlightDubs),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        dubUpdates.push(args);
        return {};
      }),
    },
  },
}));

vi.mock("@/utils/elevenlabs", () => ({
  getDubbingStatus: vi.fn(async (dubbingId: string) => {
    const result = statusByDubbingId[dubbingId];
    if (result instanceof Error) throw result;
    return result ?? "dubbing";
  }),
}));

vi.mock("@/lib/credits", () => ({
  restoreSpend: vi.fn(async (params: { userId: string; refId: string; reason?: string }) => {
    restoreSpendCalls.push(params);
    return 1;
  }),
}));

vi.mock("@/lib/autoclip-dub", () => ({
  claimAndEnqueueFinish: vi.fn(async (dub: unknown) => {
    claimAndEnqueueFinishCalls.push(dub);
    return claimAndEnqueueFinishReturns;
  }),
}));

const { runDubSweep, DUB_STALE_TIMEOUT_MINUTES } = await import("./dub-sweep");

function makeDub(overrides: Partial<(typeof inFlightDubs)[number]> = {}): (typeof inFlightDubs)[number] {
  return {
    id: "dub1",
    dubbingId: "el-dub-1",
    userId: "u1",
    refId: "ref1",
    createdAt: new Date(),
    clip: { projectId: "p1" },
    ...overrides,
  };
}

beforeEach(() => {
  inFlightDubs = [];
  dubUpdates.length = 0;
  restoreSpendCalls.length = 0;
  claimAndEnqueueFinishCalls.length = 0;
  claimAndEnqueueFinishReturns = true;
  statusByDubbingId = {};
  vi.clearAllMocks();
});

describe("runDubSweep", () => {
  it("reports zero checked/enqueued/failed when nothing is in flight", async () => {
    const before = Date.now();
    const result = await runDubSweep();
    expect(result).toEqual({ ok: true, checked: 0, enqueued: 0, failed: 0, at: expect.any(String) });
    expect(new Date(result.at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("claims and enqueues finishDubJob for a dub ElevenLabs reports as dubbed", async () => {
    const dub = makeDub();
    inFlightDubs = [dub];
    statusByDubbingId["el-dub-1"] = "dubbed";

    const result = await runDubSweep();

    expect(result).toEqual({ ok: true, checked: 1, enqueued: 1, failed: 0, at: expect.any(String) });
    expect(claimAndEnqueueFinishCalls).toEqual([dub]);
    expect(dubUpdates).toEqual([]); // claimAndEnqueueFinish (mocked) owns that write, not the sweep
  });

  it("does not count a claim as enqueued when claimAndEnqueueFinish reports it was already claimed", async () => {
    inFlightDubs = [makeDub()];
    statusByDubbingId["el-dub-1"] = "dubbed";
    claimAndEnqueueFinishReturns = false;

    const result = await runDubSweep();

    expect(result.enqueued).toBe(0);
    expect(claimAndEnqueueFinishCalls).toHaveLength(1);
  });

  it("fails and refunds a dub ElevenLabs reports as failed", async () => {
    inFlightDubs = [makeDub({ id: "dub2" })];
    statusByDubbingId["el-dub-1"] = "failed";

    const result = await runDubSweep();

    expect(result).toEqual({ ok: true, checked: 1, enqueued: 0, failed: 1, at: expect.any(String) });
    expect(restoreSpendCalls).toEqual([{ userId: "u1", refId: "ref1", reason: "refund:auto-clip-dub-failed" }]);
    expect(dubUpdates).toEqual([{ where: { id: "dub2" }, data: { status: "failed" } }]);
  });

  it("leaves a still-dubbing job alone when it isn't stale yet", async () => {
    inFlightDubs = [makeDub({ createdAt: new Date() })];
    statusByDubbingId["el-dub-1"] = "dubbing";

    const result = await runDubSweep();

    expect(result).toEqual({ ok: true, checked: 1, enqueued: 0, failed: 0, at: expect.any(String) });
    expect(restoreSpendCalls).toEqual([]);
    expect(dubUpdates).toEqual([]);
  });

  it("force-fails and refunds a still-dubbing job past the staleness cutoff", async () => {
    const staleCreatedAt = new Date(Date.now() - (DUB_STALE_TIMEOUT_MINUTES + 1) * 60 * 1000);
    inFlightDubs = [makeDub({ id: "dub3", createdAt: staleCreatedAt })];
    statusByDubbingId["el-dub-1"] = "dubbing";

    const result = await runDubSweep();

    expect(result.failed).toBe(1);
    expect(restoreSpendCalls).toEqual([{ userId: "u1", refId: "ref1", reason: "refund:auto-clip-dub-failed" }]);
    expect(dubUpdates).toEqual([{ where: { id: "dub3" }, data: { status: "failed" } }]);
  });

  it("force-fails a stale job even when the ElevenLabs status check itself throws", async () => {
    const staleCreatedAt = new Date(Date.now() - (DUB_STALE_TIMEOUT_MINUTES + 5) * 60 * 1000);
    inFlightDubs = [makeDub({ id: "dub4", createdAt: staleCreatedAt })];
    statusByDubbingId["el-dub-1"] = new Error("ElevenLabs is down");

    const result = await runDubSweep();

    expect(result.failed).toBe(1);
    expect(dubUpdates).toEqual([{ where: { id: "dub4" }, data: { status: "failed" } }]);
  });

  it("does not force-fail a non-stale job when the status check throws", async () => {
    inFlightDubs = [makeDub({ id: "dub5", createdAt: new Date() })];
    statusByDubbingId["el-dub-1"] = new Error("transient network error");

    const result = await runDubSweep();

    expect(result.failed).toBe(0);
    expect(dubUpdates).toEqual([]);
    expect(restoreSpendCalls).toEqual([]);
  });

  it("logs but does not throw when a stale dub has no userId/refId to refund", async () => {
    const staleCreatedAt = new Date(Date.now() - (DUB_STALE_TIMEOUT_MINUTES + 1) * 60 * 1000);
    inFlightDubs = [makeDub({ id: "dub6", createdAt: staleCreatedAt, userId: null, refId: null })];
    statusByDubbingId["el-dub-1"] = "dubbing";

    const result = await runDubSweep();

    expect(result.failed).toBe(1);
    expect(restoreSpendCalls).toEqual([]);
    expect(dubUpdates).toEqual([{ where: { id: "dub6" }, data: { status: "failed" } }]);
  });
});
