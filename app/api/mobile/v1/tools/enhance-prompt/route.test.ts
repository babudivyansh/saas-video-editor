import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The AI Media "Prompt generator": the web's own route (Gemini, rate-limited)
// behind the app's auth and wording.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const web = vi.fn();
vi.mock("@/app/api/tools/enhance-prompt/route", () => ({ POST: web }));

const { POST } = await import("./route");
const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/mobile/v1/tools/enhance-prompt", { method: "POST", headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("POST /tools/enhance-prompt", () => {
  it("returns the rewritten prompt", async () => {
    web.mockResolvedValue(NextResponse.json({ prompt: "  A lighthouse in a storm, dramatic light  " }));
    const res = await call({ prompt: "A lighthouse" });
    expect([res.status, await res.json()]).toEqual([200, { prompt: "A lighthouse in a storm, dramatic light" }]);
    expect(await (web.mock.calls[0]![0] as NextRequest).json()).toEqual({ prompt: "A lighthouse" });
  });

  it("checks the prompt before asking the AI", async () => {
    expect((await call({ prompt: "a" })).status).toBe(400);
    expect((await call({ prompt: "x".repeat(1001) })).status).toBe(400);
    expect(web).not.toHaveBeenCalled();
  });

  it("says when the hourly limit is used up", async () => {
    web.mockResolvedValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }));
    const res = await call({ prompt: "A lighthouse" });
    expect([res.status, (await res.json()).code]).toEqual([429, "rate_limited"]);
  });
});
