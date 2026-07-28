import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

let authUser: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  getApiKeyAuth: vi.fn(async () => null),
}));

let review: { id: string; userId: string; status: string } | null;
let reportCreateError: { code: string } | null;
let updatedCounters: { reportCount: number; status: string };
const reportCreate = vi.fn();
const reviewUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findFirst: vi.fn(async () => review),
      update: (...args: unknown[]) => reviewUpdate(...args),
    },
    reviewReport: {
      create: (...args: unknown[]) => {
        if (reportCreateError) throw Object.assign(new Error("dup"), reportCreateError);
        return reportCreate(...args);
      },
    },
  },
}));

const getReviewSettings = vi.fn();
vi.mock("@/lib/reviews/settings", () => ({
  getReviewSettings: (...args: unknown[]) => getReviewSettings(...args),
}));

const notifyAdmins = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notifyAdmins: (...args: unknown[]) => notifyAdmins(...args) }));

const { POST } = await import("./route");

function post(id: string, body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/reviews/${id}/report`, { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer tok" } }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  review = { id: "rev-1", userId: "author-1", status: "published" };
  reportCreateError = null;
  updatedCounters = { reportCount: 1, status: "published" };
  reviewUpdate.mockImplementation(async () => updatedCounters);
  getReviewSettings.mockResolvedValue({ autoHideReportThreshold: 3 });
});

describe("POST /api/reviews/[id]/report", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await post("rev-1", { reason: "spam" });
    expect(res.status).toBe(401);
  });

  it("400s on an invalid reason", async () => {
    const res = await post("rev-1", { reason: "not_a_real_reason" });
    expect(res.status).toBe(400);
  });

  it("404s on a non-published review", async () => {
    review = null;
    const res = await post("rev-1", { reason: "spam" });
    expect(res.status).toBe(404);
  });

  it("403s reporting your own review", async () => {
    review = { id: "rev-1", userId: "u1", status: "published" };
    const res = await post("rev-1", { reason: "spam" });
    expect(res.status).toBe(403);
  });

  it("409s a duplicate report", async () => {
    reportCreateError = { code: "P2002" };
    const res = await post("rev-1", { reason: "spam" });
    expect(res.status).toBe(409);
  });

  it("records a report and increments the counter", async () => {
    const res = await post("rev-1", { reason: "spam", details: "looks fake" });
    expect(res.status).toBe(200);
    expect(reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewId: "rev-1", userId: "u1", reason: "spam", details: "looks fake" }) }),
    );
    expect(reviewUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { reportCount: { increment: 1 } } }));
  });

  it("auto-hides a published review once it crosses the report threshold", async () => {
    updatedCounters = { reportCount: 3, status: "published" };
    const res = await post("rev-1", { reason: "spam" });
    expect(res.status).toBe(200);
    expect(reviewUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "hidden" } }));
    expect(notifyAdmins).toHaveBeenCalledWith("admin_review_reported", expect.any(String), expect.any(String), "/admin/reviews/rev-1");
  });

  it("does not re-hide an already non-published review", async () => {
    updatedCounters = { reportCount: 5, status: "hidden" };
    await post("rev-1", { reason: "spam" });
    expect(reviewUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: "hidden" } }));
  });
});
