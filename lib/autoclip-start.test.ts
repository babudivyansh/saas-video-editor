// startAutoClipRun — the one implementation behind both AutoClip create routes.
// Every exit after something was consumed must put it back: the project claim
// and, once charged, the premium-caption credit hold.
import { beforeEach, describe, expect, it, vi } from "vitest";

let project: Record<string, unknown> | null;
let claimCount = 1;
let toolEnabled = true;
let precheck: { ok: boolean; needed?: number; available?: number; overflowCredits?: number } = { ok: true };
let estimateTotal = 0;
let spendOk = true;

const projectUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const projectUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const enqueue = vi.hoisted(() => vi.fn(async () => {}));
const spendCredits = vi.hoisted(() => vi.fn());
const restoreSpend = vi.hoisted(() => vi.fn(async () => 1));
const logToolGeneration = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "g" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserTier: vi.fn(async () => "pro") }));
vi.mock("@/lib/plans/tiers", () => ({ tierPriority: () => 3 }));
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: () => ({ enqueue, driver: "in-process" }) }));
vi.mock("@/lib/autoclip-pipeline", () => ({ pickJob: vi.fn() }));
vi.mock("@/lib/autoclip-minutes", () => ({ precheckRunMinutes: vi.fn(async () => precheck) }));
vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled: toolEnabled })) }));
vi.mock("@/lib/captions/createPayload", () => ({ resolveCaptionCreateInput: () => ({ captionStyleIndex: 0, captionTemplateId: null }) }));
vi.mock("@/lib/captions/pricing", () => ({ getCaptionRenderPricing: vi.fn(async () => ({})) }));
vi.mock("@/lib/captions/runEstimate", () => ({ estimateRunCost: () => ({ total: estimateTotal }), bandMaxSeconds: () => 60 }));
vi.mock("@/lib/caption-templates", () => ({ isPremiumTemplateId: () => false }));
vi.mock("@/lib/credits", () => ({ spendCredits, restoreSpend, logToolGeneration }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => project),
      updateMany: projectUpdateMany,
      update: projectUpdate,
    },
  },
}));

const { startAutoClipRun } = await import("./autoclip-start");

beforeEach(() => {
  vi.clearAllMocks();
  project = { id: "p1", userId: "u1", uploadedVideoUrl: "https://bucket/uploads/u1/v.mp4", sourceAsset: { duration: 600 } };
  claimCount = 1;
  toolEnabled = true;
  precheck = { ok: true };
  estimateTotal = 0;
  spendOk = true;
  projectUpdateMany.mockImplementation(async () => ({ count: claimCount }));
  spendCredits.mockImplementation(async () => (spendOk ? { ok: true, balances: { total: 90 } } : { ok: false, balances: { total: 1 } }));
  enqueue.mockResolvedValue(undefined);
});

const run = (body: Record<string, unknown> = {}) => startAutoClipRun("u1", { projectId: "p1", ...body });
const released = () => projectUpdate.mock.calls.some((c) => (c as unknown as [{ data: { status: string } }])[0].data.status === "draft");

describe("startAutoClipRun", () => {
  it("rejects an invalid body before touching anything", async () => {
    const res = await run({ minDuration: 90, maxDuration: 30 });
    expect(res.status).toBe(400);
    expect(projectUpdateMany).not.toHaveBeenCalled();
  });

  it("404s another user's (or a missing) project", async () => {
    project = null;
    expect((await run()).status).toBe(404);
  });

  it("refuses a run the user can't pay minutes for, before claiming", async () => {
    precheck = { ok: false, needed: 10, available: 2, overflowCredits: 3 };
    const res = await run();
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: "insufficient_minutes", required: 10, balance: 2 });
    expect(projectUpdateMany).not.toHaveBeenCalled();
  });

  it("409s a double submit (the atomic claim lost)", async () => {
    claimCount = 0;
    const res = await run();
    expect(res.status).toBe(409);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("releases the claim when the admin kill-switch is off", async () => {
    toolEnabled = false;
    expect((await run()).status).toBe(503);
    expect(released()).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("releases the claim when the premium caption hold can't be paid", async () => {
    estimateTotal = 12;
    spendOk = false;
    const res = await run();
    expect(res.status).toBe(402);
    expect(released()).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("refunds the hold and releases the claim when the job can't be queued", async () => {
    estimateTotal = 12;
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    const res = await run();
    expect(res.status).toBe(503);
    expect(restoreSpend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", refId: "auto-clip:p1" }));
    expect(released()).toBe(true);
    expect(logToolGeneration).not.toHaveBeenCalled();
  });

  it("queues a run with a fresh, colon-free job id and tier priority", async () => {
    estimateTotal = 12;
    const res = await run({ clipCount: 3 });
    expect(res).toEqual({ status: 200, body: { status: "analyzing", projectId: "p1" } });
    const [jobId, payload, opts] = enqueue.mock.calls[0] as unknown as [string, { clipCount: number }, { priority: number; rejectOnFailure: boolean }];
    expect(jobId).toMatch(/^p1-/);
    expect(jobId).not.toContain(":");
    expect(payload.clipCount).toBe(3);
    expect(opts).toEqual({ priority: 3, rejectOnFailure: true });
    expect(logToolGeneration).toHaveBeenCalledWith(expect.objectContaining({ creditsCost: 12, refId: "auto-clip:p1" }));
  });

  it("charges nothing up front for a native-caption run", async () => {
    await run();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
