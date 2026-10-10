import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

let subscriber = true;
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })),
  requireSubscriber: vi.fn(async () => (subscriber ? { userId: "u1" } : null)),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const webAdd = vi.fn();
const webSummary = vi.fn();
vi.mock("@/app/api/social/competitors/route", () => ({ POST: webAdd }));
vi.mock("@/app/api/social/summary/route", () => ({ POST: webSummary }));
vi.mock("@/lib/social/competitors", () => ({ competitorTrackingConfigured: () => true }));
const aiFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { aiInsight: { findFirst: aiFindFirst } } }));
const ownedAccount = vi.fn();
const buildOverview = vi.fn(async () => ({ range: 30 }));
const buildAudience = vi.fn(async () => ({ provider: "youtube" }));
vi.mock("@/lib/mobile/social", async () => {
  const real = await vi.importActual<typeof import("@/lib/mobile/social")>("@/lib/mobile/social");
  return { rangeAndTz: real.rangeAndTz, toSummary: real.toSummary, ownedAccount, buildOverview, buildAudience, listCompetitors: vi.fn(async () => []), myCompetitorStats: vi.fn(async () => []) };
});

const overview = (await import("./overview/route")).GET;
const audience = (await import("./accounts/[id]/audience/route")).GET;
const competitors = await import("./competitors/route");
const summary = await import("./summary/route");

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost/api/mobile/v1/social${url}`, { method, headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  subscriber = true;
});

describe("social", () => {
  it("is for subscribers, like the web's Social Tracker", async () => {
    subscriber = false;
    const res = await overview(req("/overview"));
    expect([res.status, (await res.json()).code]).toEqual([402, "subscription_required"]);
    expect(buildOverview).not.toHaveBeenCalled();
  });

  it("checks the range and time zone", async () => {
    expect((await overview(req("/overview?range=45"))).status).toBe(400);
    expect((await overview(req("/overview?tz=Not/AZone"))).status).toBe(400);
    await overview(req("/overview?range=90&tz=Asia/Kolkata"));
    expect(buildOverview).toHaveBeenCalledWith("u1", 90, "Asia/Kolkata");
  });

  it("404s an account that isn't the caller's", async () => {
    ownedAccount.mockResolvedValue(null);
    expect((await audience(req("/accounts/theirs/audience"), ctx("theirs"))).status).toBe(404);
    expect(buildAudience).not.toHaveBeenCalled();
  });

  it("adds a competitor through the web route, passing its limit refusal through", async () => {
    webAdd.mockResolvedValue(NextResponse.json({ error: "You can track up to 3 competitors." }, { status: 409 }));
    const res = await competitors.POST(req("/competitors", "POST", { provider: "instagram", handle: "@growthwithlena" }));
    expect([res.status, (await res.json()).error]).toEqual([409, "You can track up to 3 competitors."]);
    expect(await (webAdd.mock.calls[0]![0] as NextRequest).json()).toEqual({ provider: "instagram", handle: "growthwithlena" });
  });

  it("makes a summary through the web route (charged there) and returns it in the app's shape", async () => {
    const now = new Date().toISOString();
    webSummary.mockResolvedValue(
      NextResponse.json({ data: { summary: { id: "ai1", accountId: "yt1", kind: "executive_summary_weekly", periodStart: now, periodEnd: now, createdAt: now, content: { summary: "Up 18%.", wins: [], concerns: [], recommendations: [] } } } }, { status: 201 }),
    );
    const res = await summary.POST(req("/summary", "POST", { accountId: "yt1" }));
    expect(res.status).toBe(201);
    expect((await res.json()).summary).toMatchObject({ id: "ai1", period: "weekly", summary: "Up 18%." });
    webSummary.mockResolvedValue(NextResponse.json({ error: "Insufficient credits", code: "insufficient_credits" }, { status: 402 }));
    const broke = await summary.POST(req("/summary", "POST", { accountId: "yt1" }));
    expect([broke.status, (await broke.json()).code]).toEqual([402, "insufficient_credits"]);
  });

  it("reads the latest summary for the caller's own account only", async () => {
    ownedAccount.mockResolvedValue(null);
    expect((await summary.GET(req("/summary?accountId=theirs"))).status).toBe(404);
    expect(aiFindFirst).not.toHaveBeenCalled();
  });
});
