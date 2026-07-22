import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 19 : 0 })),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

const resolveReferralCode = vi.fn();
vi.mock("@/lib/affiliate", () => ({ resolveReferralCode }));

const { POST } = await import("./route");

function post(body: unknown, cookie?: string) {
  return POST(
    new NextRequest("http://localhost/api/affiliate/validate-code", {
      method: "POST",
      body: JSON.stringify(body),
      headers: cookie ? { cookie: `affiliate_ref=${cookie}` } : undefined,
    }),
  );
}

beforeEach(() => {
  rateLimitAllowed = true;
  vi.clearAllMocks();
});

describe("POST /api/affiliate/validate-code", () => {
  it("429s once the rate limit is exceeded", async () => {
    rateLimitAllowed = false;
    const res = await post({ code: "ABC-1234" });
    expect(res.status).toBe(429);
    expect(resolveReferralCode).not.toHaveBeenCalled();
  });

  it("400s on a malformed body", async () => {
    const res = await post({ code: "" });
    expect(res.status).toBe(400);
  });

  it("returns valid:true and the code on a clean match", async () => {
    resolveReferralCode.mockResolvedValueOnce({ applied: true, code: "ABC-1234", affiliateId: "aff-1", affiliateUser: {} });
    const res = await post({ code: "abc-1234", email: "new@test.com" });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ valid: true, code: "ABC-1234" });
  });

  it("returns valid:false with the reason on rejection", async () => {
    resolveReferralCode.mockResolvedValueOnce({ applied: false, reason: "self" });
    const res = await post({ code: "ABC-1234", email: "owner@test.com" });
    const data = await res.json();
    expect(data).toEqual({ valid: false, reason: "self" });
  });

  it("never leaks affiliate owner details in the response", async () => {
    resolveReferralCode.mockResolvedValueOnce({
      applied: true,
      code: "ABC-1234",
      affiliateId: "aff-1",
      affiliateUser: { userId: "owner-1", email: "owner@test.com", firstName: "Owner", name: "Owner Name" },
    });
    const res = await post({ code: "abc-1234" });
    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain("owner@test.com");
  });

  it("passes the affiliate_ref cookie through as cookieCode", async () => {
    resolveReferralCode.mockResolvedValueOnce({ applied: false, reason: "duplicate" });
    await post({ code: "TYPED-1" }, "COOKIE-1");
    expect(resolveReferralCode).toHaveBeenCalledWith(
      expect.objectContaining({ cookieCode: "COOKIE-1", typedCode: "TYPED-1" }),
    );
  });
});
