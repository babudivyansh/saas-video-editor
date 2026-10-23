import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Finishing a phone connect the OAuth callback parked: only the session of the
// user who started it can (lib/social/oauth.ts).

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })),
  requireSubscriber: vi.fn(),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
type Pending = { userId: string; provider: string; oauthProvider: "youtube" | "meta"; code: string; verifier: string };
let parked: Pending | null;
const takeAppConnect = vi.fn(async () => {
  const p = parked;
  parked = null;
  return p;
});
vi.mock("@/lib/social/oauth", () => ({ takeAppConnect }));
const handleCallback = vi.fn(async () => ["youtube"]);
vi.mock("@/lib/social/service", () => ({ handleCallback }));
const markQuestComplete = vi.fn();
vi.mock("@/lib/quests", () => ({ markQuestComplete }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./connect/complete/route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/mobile/v1/social/connect/complete", { method: "POST", headers: { authorization: "Bearer acc" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  parked = { userId: "u1", provider: "youtube", oauthProvider: "youtube", code: "c1", verifier: "v1" };
});

describe("POST /api/mobile/v1/social/connect/complete", () => {
  it("finishes the caller's own parked connect, once", async () => {
    const res = await post({ pending: "p1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: ["youtube"] });
    expect(takeAppConnect).toHaveBeenCalledWith("p1");
    expect(handleCallback).toHaveBeenCalledWith("youtube", "u1", "c1", "v1");
    expect(markQuestComplete).toHaveBeenCalledWith("u1", "track-account");

    const again = await post({ pending: "p1" });
    expect([again.status, (await again.json()).code]).toEqual([400, "invalid_state"]);
  });

  it("won't finish a connect someone else started", async () => {
    parked = { ...parked!, userId: "attacker" };
    const res = await post({ pending: "p1" });
    expect([res.status, (await res.json()).code]).toEqual([400, "invalid_state"]);
    expect(handleCallback).not.toHaveBeenCalled();
  });

  it("400s without a pending id", async () => {
    expect((await post({})).status).toBe(400);
    expect(takeAppConnect).not.toHaveBeenCalled();
  });

  it("says when the platform's account couldn't be read", async () => {
    handleCallback.mockRejectedValueOnce(new Error("boom"));
    const res = await post({ pending: "p1" });
    expect([res.status, (await res.json()).code]).toEqual([502, "connect_failed"]);
  });
});
