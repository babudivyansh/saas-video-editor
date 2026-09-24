// @vitest-environment node
//
// POST .../dub — claim before charge, and refund whenever a charged dub can't
// start.
//
// This route used to charge first, under a `Date.now()` refId, with no claim
// at all: a double-click bought two ElevenLabs dubs of the same clip, and a
// failure creating the row or queueing the job after the charge was never
// refunded.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { spendCredits, restoreSpend, enqueue, dubFindFirst, dubCreate, dubUpdate, dubDelete } = vi.hoisted(() => ({
  spendCredits: vi.fn(async (_p: unknown) => ({ ok: true as boolean, balances: { total: 50 } })),
  restoreSpend: vi.fn(async (_p: unknown) => 4),
  enqueue: vi.fn(async (..._a: unknown[]) => {}),
  dubFindFirst: vi.fn(async (_a: unknown) => null as unknown),
  dubCreate: vi.fn(async (_a: unknown) => ({ id: "dub_1", clipId: "clip_1", targetLang: "es", status: "dubbing" })),
  dubUpdate: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "dub_1", ...a.data })),
  dubDelete: vi.fn(async (_a: unknown) => ({})),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: vi.fn(async () => "pro"),
}));
vi.mock("@/lib/prisma", () => {
  const clipDub = {
    findFirst: (a: unknown) => dubFindFirst(a),
    create: (a: unknown) => dubCreate(a),
    update: (a: { data: Record<string, unknown> }) => dubUpdate(a),
    delete: (a: unknown) => dubDelete(a),
    findMany: vi.fn(async () => []),
  };
  return {
    prisma: {
      project: { findFirst: vi.fn(async () => ({ id: "p1", userId: "u1" })) },
      clip: { findFirst: vi.fn(async () => ({ id: "clip_1", projectId: "p1", status: "ready", videoUrl: "https://s3/c.mp4", durationSec: 60 })) },
      clipDub,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: vi.fn(async () => []), clipDub })),
    },
  };
});
vi.mock("@/lib/env", () => ({ env: { ELEVENLABS_API_KEY: "test-key" } }));
vi.mock("@/lib/credits", () => ({
  spendCredits: (p: unknown) => spendCredits(p),
  restoreSpend: (p: unknown) => restoreSpend(p),
  logToolGeneration: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/plans/tiers", () => ({ tierAtLeast: vi.fn(() => true) }));
vi.mock("@/lib/tool-costs", () => ({ TOOL_COSTS: { "clip-dub": {} } }));
vi.mock("@/lib/autoclip-pipeline", () => ({ getAutoClipPricing: vi.fn(async () => ({ dubPerMinute: 2 })) }));
vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled: true })) }));
vi.mock("@/lib/autoclip-dub", () => ({
  dubStartQueue: { enqueue: (...a: unknown[]) => enqueue(...a) },
  computeDubCost: vi.fn(() => 4),
}));
vi.mock("@/utils/elevenlabs", () => ({ DUB_LANGUAGES: [{ code: "es", label: "Spanish" }] }));

const { POST } = await import("./route");

const post = () =>
  POST(
    new NextRequest("http://localhost/api/projects/p1/clips/clip_1/dub", {
      method: "POST",
      body: JSON.stringify({ targetLang: "es" }),
    }),
    { params: Promise.resolve({ id: "p1", clipId: "clip_1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  dubFindFirst.mockResolvedValue(null);
  spendCredits.mockResolvedValue({ ok: true, balances: { total: 50 } });
  enqueue.mockResolvedValue(undefined);
});

describe("POST .../dub", () => {
  it("charges under a refId tied to the dub row, and queues it", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(spendCredits).toHaveBeenCalledWith(expect.objectContaining({ refId: "auto-clip-dub:dub_1", amount: 4 }));
    expect(enqueue).toHaveBeenCalledWith("dub_1", expect.anything(), { rejectOnFailure: true });
  });

  it("refuses a second dub in the same language while one is in flight — and charges nothing", async () => {
    dubFindFirst.mockResolvedValueOnce({ id: "dub_0" });
    const res = await post();
    expect(res.status).toBe(409);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(dubCreate).not.toHaveBeenCalled();
  });

  it("removes the claim when the user can't pay", async () => {
    spendCredits.mockResolvedValueOnce({ ok: false, balances: { total: 1 } });
    const res = await post();
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("insufficient_credits");
    expect(dubDelete).toHaveBeenCalledWith({ where: { id: "dub_1" } });
  });

  it("refunds, and marks the dub failed, when it can't be queued", async () => {
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    const res = await post();
    expect(res.status).toBe(503);
    expect(restoreSpend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", refId: "auto-clip-dub:dub_1" }));
    expect(dubUpdate).toHaveBeenCalledWith({ where: { id: "dub_1" }, data: { status: "failed" } });
  });
});
