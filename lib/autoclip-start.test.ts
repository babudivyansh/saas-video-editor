// startAutoClipRun — the one implementation behind both AutoClip create routes.
// Every exit after the project is claimed must release the claim. Nothing is
// charged here; the caption plan gate runs before the claim.
import { beforeEach, describe, expect, it, vi } from "vitest";

let project: Record<string, unknown> | null;
let claimCount = 1;
let toolEnabled = true;
let precheck: { ok: boolean; needed?: number; available?: number; overflowCredits?: number } = { ok: true };
let tier = "pro";

const projectUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const projectUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const enqueue = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "g" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserTier: vi.fn(async () => tier) }));
vi.mock("@/lib/plans/tiers", () => ({ tierPriority: () => 3 }));
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: () => ({ enqueue, driver: "in-process" }) }));
vi.mock("@/lib/autoclip-pipeline", () => ({ pickJob: vi.fn() }));
vi.mock("@/lib/autoclip-minutes", () => ({ precheckRunMinutes: vi.fn(async () => precheck) }));
vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled: toolEnabled })) }));
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
  tier = "pro";
  projectUpdateMany.mockImplementation(async () => ({ count: claimCount }));
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

  it("refuses a caption template above the user's plan, before claiming", async () => {
    tier = "free";
    const res = await run({ captionTemplateId: "hypestack" }); // a Pro template
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "template_locked", templateId: "hypestack", requiredTier: "pro" });
    expect(projectUpdateMany).not.toHaveBeenCalled();
  });

  it("lets a free user run a free template, and a retired id resolves before the gate", async () => {
    tier = "free";
    expect((await run({ captionTemplateId: "boardroom" })).status).toBe(200);
    expect((await run({ captionTemplateId: "hormozi" })).status).toBe(200); // -> boardroom (free)
  });

  it("releases the claim when the job can't be queued", async () => {
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    const res = await run();
    expect(res.status).toBe(503);
    expect(released()).toBe(true);
  });

  it("queues a run with a fresh, colon-free job id and tier priority", async () => {
    const res = await run({ clipCount: 3, captionTemplateId: "slam" });
    expect(res).toEqual({ status: 200, body: { status: "analyzing", projectId: "p1" } });
    const [jobId, payload, opts] = enqueue.mock.calls[0] as unknown as [string, { clipCount: number; templateId: string }, { priority: number; rejectOnFailure: boolean }];
    expect(jobId).toMatch(/^p1-/);
    expect(jobId).not.toContain(":");
    expect(payload.clipCount).toBe(3);
    expect(payload.templateId).toBe("slam");
    expect(opts).toEqual({ priority: 3, rejectOnFailure: true });
  });
});
