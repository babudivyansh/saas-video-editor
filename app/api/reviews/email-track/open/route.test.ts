import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let verifyResult: { userId: string; stage: 1 | 2 | 3 } | null = null;
vi.mock("@/lib/reviews/email-track-token", () => ({
  verifyTrackToken: (...args: unknown[]) => verifyTrackTokenMock(...args),
}));
const verifyTrackTokenMock = vi.fn(() => verifyResult);

const updateMany = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { reviewEmailSequence: { updateMany: (...args: unknown[]) => updateMany(...args) } },
}));

const { GET } = await import("./route");

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/reviews/email-track/open${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyResult = null;
});

describe("GET /api/reviews/email-track/open", () => {
  it("always returns a 200 GIF, even with no token", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("returns the pixel without recording anything for an invalid token", async () => {
    verifyResult = null;
    const res = await get("?t=bad");
    expect(res.status).toBe(200);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("marks the correct stage opened for a valid token, only if not already opened", async () => {
    verifyResult = { userId: "u1", stage: 2 };
    const res = await get("?t=good&stage=2");
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", email2OpenedAt: null },
        data: { email2OpenedAt: expect.any(Date) },
      }),
    );
  });
});
