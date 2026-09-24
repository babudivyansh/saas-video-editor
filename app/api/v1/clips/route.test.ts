// @vitest-environment node
//
// The public API must start runs by exactly the same rules as the dashboard.
// It used to be a hand-kept copy of app/api/generate/auto-clip/route.ts that
// had drifted — most expensively, it skipped the free tier's monthly
// allowance, so any free user with an API key had unlimited runs. Both routes
// now call lib/autoclip-start.ts; these pin that the gates are actually on
// this surface too.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spendCredits, enqueue, rateLimit, userTier, apiAuth } = vi.hoisted(() => ({
  spendCredits: vi.fn(async (_p: unknown) => ({ ok: true, balances: { total: 100 } })),
  enqueue: vi.fn(async (..._a: unknown[]) => {}),
  rateLimit: vi.fn(async (..._a: unknown[]) => ({ allowed: true })),
  userTier: vi.fn(async (_u: string) => "free"),
  apiAuth: vi.fn(async () => ({ userId: "u1", scopes: ["read", "write"] } as { userId: string; scopes: string[] } | null)),
}));

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "k" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getApiKeyAuth: () => apiAuth(), getUserTier: (u: string) => userTier(u) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => ({ id: "p1", userId: "u1", uploadedVideoUrl: "https://s3/v.mp4" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/credits", () => ({
  spendCredits: (p: unknown) => spendCredits(p),
  restoreSpend: vi.fn(async () => 0),
  logToolGeneration: vi.fn(async () => {}),
}));
vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled: true })) }));
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: () => ({ enqueue, driver: "in-process" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a), releaseRateLimit: vi.fn(async () => {}) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/autoclip-pipeline", () => ({
  pickJob: vi.fn(),
  getAutoClipPricing: vi.fn(async () => ({ perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1, dubPerMinute: 2 })),
}));
vi.mock("@/lib/captions/pricing", () => ({ getCaptionRenderPricing: vi.fn(async () => ({ perBillableMinute: 8, perRender: 0 })) }));

const { POST } = await import("./route");
const req = (body: unknown) => ({ json: async () => body, headers: new Headers() }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  userTier.mockResolvedValue("free");
  rateLimit.mockResolvedValue({ allowed: true });
  apiAuth.mockResolvedValue({ userId: "u1", scopes: ["read", "write"] });
});

describe("POST /api/v1/clips", () => {
  it("enforces the free tier's monthly allowance, like the dashboard", async () => {
    rateLimit.mockResolvedValueOnce({ allowed: false });
    const res = await POST(req({ projectId: "p1" }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("free_limit_reached");
    expect(rateLimit).toHaveBeenCalledWith("autoclip-free:u1", expect.any(Number), expect.any(Number));
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("queues with the caller's tier priority", async () => {
    userTier.mockResolvedValue("pro");
    const res = await POST(req({ projectId: "p1" }));
    expect(res.status).toBe(200);
    expect((enqueue.mock.calls[0] as unknown[])[2]).toMatchObject({ priority: expect.any(Number), rejectOnFailure: true });
  });

  it("rejects a string maxDuration instead of billing it at 60s", async () => {
    const res = await POST(req({ projectId: "p1", maxDuration: "300" }));
    expect(res.status).toBe(400);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("still requires a write-scoped key", async () => {
    apiAuth.mockResolvedValueOnce({ userId: "u1", scopes: ["read"] });
    const res = await POST(req({ projectId: "p1" }));
    expect(res.status).toBe(403);
  });
});
