// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Guards for the three things that moved here when the clip-review step was
// removed. Each of them previously lived ONLY on
// app/api/projects/[id]/clips/confirm/route.ts, so deleting that route without
// re-homing them would have removed them from the product entirely:
//
//   1. the admin kill-switch (getToolConfig("auto-clip").enabled)
//   2. the credit charge + its 402 insufficient-credits response
//   3. the atomic claim that stops a double-submit charging twice
//
// The 402 case in particular was the only coverage of AutoClip's
// insufficient-credits path, and it used to be asserted through the UI in
// app/dashboard/create/auto-clip/ClipsResults.component.test.tsx.

const {
  mockEnv, spendCredits, logToolGeneration, toolEnabled,
  projectFindFirst, projectUpdateMany, projectUpdate, enqueue, rateLimitAllowed, userTier,
} = vi.hoisted(() => ({
  mockEnv: { GEMINI_API_KEY: "test-key" } as Record<string, string | undefined>,
  spendCredits: vi.fn(async () => ({ ok: true as const, balances: { bonus: 0, subscription: 0, purchased: 0, total: 100 }, breakdown: {} })),
  logToolGeneration: vi.fn(async () => {}),
  toolEnabled: vi.fn(async () => ({ enabled: true, creditCost: 8 })),
  projectFindFirst: vi.fn(async () => ({ id: "p1", userId: "u1", uploadedVideoUrl: "https://s3/v.mp4" })),
  projectUpdateMany: vi.fn(async () => ({ count: 1 })),
  projectUpdate: vi.fn(async () => ({})),
  enqueue: vi.fn(async () => {}),
  rateLimitAllowed: vi.fn(async () => ({ allowed: true })),
  userTier: vi.fn(async () => "pro"),
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: (...a: unknown[]) => userTier(...(a as [])),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: (...a: unknown[]) => projectFindFirst(...(a as [])),
      updateMany: (...a: unknown[]) => projectUpdateMany(...(a as [])),
      update: (...a: unknown[]) => projectUpdate(...(a as [])),
    },
  },
}));
vi.mock("@/lib/credits", () => ({
  spendCredits: (...a: unknown[]) => spendCredits(...(a as [])),
  logToolGeneration: (...a: unknown[]) => logToolGeneration(...(a as [])),
}));
vi.mock("@/lib/tool-config", () => ({ getToolConfig: (...a: unknown[]) => toolEnabled(...(a as [])) }));
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: () => ({ enqueue, driver: "in-process" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => rateLimitAllowed(...(a as [])) }));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/autoclip-pipeline", () => ({
  pickJob: vi.fn(),
  getAutoClipPricing: vi.fn(async () => ({
    perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1, dubPerMinute: 2,
  })),
}));
vi.mock("@/lib/captions/pricing", () => ({
  getCaptionRenderPricing: vi.fn(async () => ({ perBillableMinute: 8, perRender: 0 })),
}));

const { POST } = await import("./route");

const req = (body: Record<string, unknown>) =>
  ({ json: async () => body, headers: new Headers(), nextUrl: new URL("http://t/api") }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  projectFindFirst.mockResolvedValue({ id: "p1", userId: "u1", uploadedVideoUrl: "https://s3/v.mp4" });
  projectUpdateMany.mockResolvedValue({ count: 1 });
  toolEnabled.mockResolvedValue({ enabled: true, creditCost: 8 });
  spendCredits.mockResolvedValue({ ok: true, balances: { bonus: 0, subscription: 0, purchased: 0, total: 100 }, breakdown: {} });
  rateLimitAllowed.mockResolvedValue({ allowed: true });
  userTier.mockResolvedValue("pro");
});

describe("the admin kill-switch", () => {
  it("refuses with 503 when Auto Clips are disabled, and charges nothing", async () => {
    // Regression guard: this check existed in exactly ONE place in the whole
    // feature — the confirm route — so removing that route without moving it
    // here would have made "disable Auto Clip" in admin do nothing at all.
    toolEnabled.mockResolvedValueOnce({ enabled: false, creditCost: 8 });
    const res = await POST(req({ projectId: "p1", clipCount: 8 }));
    expect(res.status).toBe(503);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("releases the project claim so a disabled run can be retried later", async () => {
    // The claim already moved the project to "analyzing"; leaving it there
    // would make the project permanently unrunnable.
    toolEnabled.mockResolvedValueOnce({ enabled: false, creditCost: 8 });
    await POST(req({ projectId: "p1" }));
    expect(projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "draft" } }),
    );
  });
});

describe("charging at Generate", () => {
  it("charges before enqueueing, under the run's refId", async () => {
    await POST(req({ projectId: "p1", clipCount: 8, minDuration: 15, maxDuration: 60 }));
    expect(spendCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", reason: "spend:auto-clip", refId: "auto-clip:p1" }),
    );
    expect(enqueue).toHaveBeenCalled();
  });

  it("charges MORE when a premium caption template is chosen", async () => {
    await POST(req({ projectId: "p1", clipCount: 4, maxDuration: 60, captionTemplateId: "clean" }));
    const nativeAmount = spendCredits.mock.calls[0][0].amount;

    spendCredits.mockClear();
    await POST(req({ projectId: "p1", clipCount: 4, maxDuration: 60, captionTemplateId: "viral-bold-01" }));
    const premiumAmount = spendCredits.mock.calls[0][0].amount;

    // The provider bills per clip, rounded up to a whole minute each, so this
    // is a large multiple — not a rounding difference.
    expect(premiumAmount).toBeGreaterThan(nativeAmount);
  });

  it("returns 402 with the shortfall instead of starting an unpaid render", async () => {
    // This is the case the removed UI test covered: the client turns a 402 into
    // the insufficient-credits modal, so the body shape matters.
    spendCredits.mockResolvedValueOnce({
      ok: false, reason: "insufficient_credits",
      balances: { bonus: 0, subscription: 0, purchased: 0, total: 2 },
    });
    const res = await POST(req({ projectId: "p1", clipCount: 8 }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_credits");
    expect(body.required).toBeGreaterThan(0);
    expect(body.balance).toBe(2);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("releases the claim on a 402 so the user can retry after topping up", async () => {
    spendCredits.mockResolvedValueOnce({
      ok: false, reason: "insufficient_credits",
      balances: { bonus: 0, subscription: 0, purchased: 0, total: 0 },
    });
    await POST(req({ projectId: "p1" }));
    expect(projectUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "draft" } }));
  });
});

describe("double-submit", () => {
  it("charges and enqueues exactly once when the claim is lost", async () => {
    // The atomic status transition IS the guard — a prior findFirst read is a
    // stale snapshot two concurrent requests would both pass. This assertion
    // moved here from the deleted confirm route's test.
    projectUpdateMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(req({ projectId: "p1" }));
    expect(res.status).toBe(409);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("caption selection", () => {
  it("passes the chosen template through to the pick job", async () => {
    await POST(req({ projectId: "p1", captionTemplateId: "viral-beast" }));
    expect(enqueue.mock.calls[0][1]).toMatchObject({ templateId: "viral-beast" });
  });

  it("carries captions-off through as the -1 sentinel with no template", async () => {
    await POST(req({ projectId: "p1", captionStyleIndex: -1 }));
    expect(enqueue.mock.calls[0][1]).toMatchObject({ captionStyleIndex: -1, templateId: null });
  });
});
