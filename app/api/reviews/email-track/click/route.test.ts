import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let verifyResult: { userId: string; stage: 1 | 2 | 3 } | null = null;
const verifyTrackTokenMock = vi.fn(() => verifyResult);
vi.mock("@/lib/reviews/email-track-token", () => ({
  verifyTrackToken: (...args: unknown[]) => verifyTrackTokenMock(...args),
}));

const updateMany = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { reviewEmailSequence: { updateMany: (...args: unknown[]) => updateMany(...args) } },
}));

const { GET } = await import("./route");

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/reviews/email-track/click${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyResult = null;
});

describe("GET /api/reviews/email-track/click", () => {
  it("falls back to /dashboard when no token or destination is given", async () => {
    const res = await get("");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://clipiro.com/dashboard");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin `to` (open-redirect guard) and falls back", async () => {
    const res = await get(`?t=good&to=${encodeURIComponent("https://evil.example.com/steal")}`);
    expect(res.headers.get("location")).toBe("https://clipiro.com/dashboard");
  });

  it("redirects to a valid same-origin `to` even with an invalid token, without recording", async () => {
    verifyResult = null;
    const res = await get(`?t=bad&to=${encodeURIComponent("https://clipiro.com/dashboard?prompt=1")}`);
    expect(res.headers.get("location")).toBe("https://clipiro.com/dashboard?prompt=1");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("records the click for the verified stage, then redirects", async () => {
    verifyResult = { userId: "u1", stage: 3 };
    const res = await get(`?t=good&stage=3&to=${encodeURIComponent("https://clipiro.com/dashboard?prompt=1")}`);
    expect(res.headers.get("location")).toBe("https://clipiro.com/dashboard?prompt=1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", email3ClickedAt: null },
        data: { email3ClickedAt: expect.any(Date) },
      }),
    );
  });
});
