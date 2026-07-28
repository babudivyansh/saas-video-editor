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

const isEligibleToSubmit = vi.fn();
vi.mock("@/lib/reviews/eligibility", () => ({
  isEligibleToSubmit: (...args: unknown[]) => isEligibleToSubmit(...args),
}));

let existingReview: Record<string, unknown> | null;
const reviewUpdate = vi.fn();
const reviewDelete = vi.fn();
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findUnique: vi.fn(async () => existingReview),
      update: (...args: unknown[]) => reviewUpdate(...args),
      delete: (...args: unknown[]) => reviewDelete(...args),
    },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

const computeSpamScore = vi.fn();
const isDuplicateReviewBody = vi.fn();
vi.mock("@/lib/reviews/spam", () => ({
  computeSpamScore: (...args: unknown[]) => computeSpamScore(...args),
  isDuplicateReviewBody: (...args: unknown[]) => isDuplicateReviewBody(...args),
}));

const getReviewSettings = vi.fn();
vi.mock("@/lib/reviews/settings", () => ({
  getReviewSettings: (...args: unknown[]) => getReviewSettings(...args),
}));

const deleteS3Object = vi.fn(async () => {});
const getAssetReadUrl = vi.fn(async (key: string) => `https://signed.example.com/${key}`);
vi.mock("@/utils/s3-upload", () => ({
  deleteS3Object: (...args: unknown[]) => deleteS3Object(...args),
  getAssetReadUrl: (...args: unknown[]) => getAssetReadUrl(...args),
}));

const { GET, PATCH, DELETE } = await import("./route");

function req(method: string, body?: unknown, token: string | null = "tok") {
  return new NextRequest("http://localhost/api/reviews/me", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  existingReview = null;
  isEligibleToSubmit.mockResolvedValue({ eligible: true });
  userFindUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) });
  isDuplicateReviewBody.mockResolvedValue(false);
  computeSpamScore.mockReturnValue({ score: 0, flags: [] });
  getReviewSettings.mockResolvedValue({ spamScoreAutoHideThreshold: 90, autoHideReportThreshold: 3, promptThrottleDays: 21, promptMaxLifetime: 3, minAccountAgeHours: 0, requireProductUsage: true });
});

describe("GET /api/reviews/me", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
  });

  it("returns null + eligibility when no review exists", async () => {
    const res = await GET(req("GET"));
    const data = await res.json();
    expect(data.review).toBeNull();
    expect(data.eligibility).toEqual({ eligible: true });
  });

  it("returns the existing review without re-checking eligibility", async () => {
    existingReview = { id: "rev-1", status: "published", attachments: [] };
    const res = await GET(req("GET"));
    const data = await res.json();
    expect(data.review).toEqual(existingReview);
    expect(data.eligibility).toBeNull();
    expect(isEligibleToSubmit).not.toHaveBeenCalled();
  });

  it("resolves fresh signed URLs for the caller's own attachments regardless of moderation status", async () => {
    existingReview = {
      id: "rev-1",
      status: "pending",
      attachments: [{ id: "att-1", s3Key: "review-attachments/u1/a.jpg", kind: "image", moderationStatus: "pending" }],
    };
    const res = await GET(req("GET"));
    const data = await res.json();
    expect(data.review.attachments).toEqual([
      { id: "att-1", kind: "image", moderationStatus: "pending", url: "https://signed.example.com/review-attachments/u1/a.jpg" },
    ]);
  });
});

describe("PATCH /api/reviews/me", () => {
  it("404s when no review exists", async () => {
    const res = await PATCH(req("PATCH", { rating: 4 }));
    expect(res.status).toBe(404);
  });

  it("400s on an invalid body", async () => {
    existingReview = { id: "rev-1", status: "pending" };
    const res = await PATCH(req("PATCH", { rating: 99 }));
    expect(res.status).toBe(400);
  });

  it("re-queues a published review for moderation on edit", async () => {
    existingReview = { id: "rev-1", status: "published", body: "a".repeat(30), rating: 4 };
    reviewUpdate.mockResolvedValue({ id: "rev-1", status: "pending" });
    const res = await PATCH(req("PATCH", { rating: 4 }));
    expect(res.status).toBe(200);
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rating: 4, status: "pending", editedAt: expect.any(Date) }),
      }),
    );
  });

  it("passes wouldRecommend/publicDisplayConsent/company/country through on edit", async () => {
    existingReview = { id: "rev-1", status: "pending", body: "a".repeat(30), rating: 4 };
    reviewUpdate.mockResolvedValue({ id: "rev-1", status: "pending" });
    await PATCH(req("PATCH", { wouldRecommend: false, publicDisplayConsent: false, company: "Acme", country: "US" }));
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wouldRecommend: false, publicDisplayConsent: false, company: "Acme", country: "US" }),
      }),
    );
  });

  it("does not touch status when editing a pending review", async () => {
    existingReview = { id: "rev-1", status: "pending", body: "a".repeat(30), rating: 4 };
    reviewUpdate.mockResolvedValue({ id: "rev-1", status: "pending" });
    await PATCH(req("PATCH", { rating: 4 }));
    const call = reviewUpdate.mock.calls[0][0];
    expect(call.data.status).toBeUndefined();
  });

  it("hides an edited review that now scores above the spam threshold, even if published", async () => {
    existingReview = { id: "rev-1", status: "published", body: "a".repeat(30), rating: 4 };
    computeSpamScore.mockReturnValue({ score: 95, flags: ["multiple_urls"] });
    reviewUpdate.mockResolvedValue({ id: "rev-1", status: "hidden" });
    await PATCH(req("PATCH", { body: "check this out http://a.com http://b.com" }));
    const call = reviewUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("hidden");
    expect(call.data.editedAt).toBeUndefined();
  });
});

describe("DELETE /api/reviews/me", () => {
  it("404s when no review exists", async () => {
    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(404);
  });

  it("deletes the caller's own review", async () => {
    existingReview = { id: "rev-1", status: "pending", attachments: [] };
    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(200);
    expect(reviewDelete).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("cleans up S3 objects for every attachment when the review is deleted", async () => {
    existingReview = {
      id: "rev-1",
      status: "pending",
      attachments: [
        { s3Key: "review-attachments/u1/a.jpg", thumbnailS3Key: null },
        { s3Key: "review-attachments/u1/b.mp4", thumbnailS3Key: "thumbnails/u1/b.jpg" },
      ],
    };
    await DELETE(req("DELETE"));
    expect(deleteS3Object).toHaveBeenCalledWith("review-attachments/u1/a.jpg");
    expect(deleteS3Object).toHaveBeenCalledWith("review-attachments/u1/b.mp4");
    expect(deleteS3Object).toHaveBeenCalledWith("thumbnails/u1/b.jpg");
  });
});
