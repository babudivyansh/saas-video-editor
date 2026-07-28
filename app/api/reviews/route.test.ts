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

const listPublishedReviews = vi.fn();
const getReviewSummary = vi.fn();
vi.mock("@/lib/reviews/queries", () => ({
  listPublishedReviews: (...args: unknown[]) => listPublishedReviews(...args),
  getReviewSummary: (...args: unknown[]) => getReviewSummary(...args),
}));

const isEligibleToSubmit = vi.fn();
const computeVerifiedCustomer = vi.fn();
vi.mock("@/lib/reviews/eligibility", () => ({
  isEligibleToSubmit: (...args: unknown[]) => isEligibleToSubmit(...args),
  computeVerifiedCustomer: (...args: unknown[]) => computeVerifiedCustomer(...args),
}));

const reviewCreate = vi.fn();
const userFindUnique = vi.fn();
const promptEventUpdateMany = vi.fn(async () => ({}));
const emailSequenceUpdateMany = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: { create: (...args: unknown[]) => reviewCreate(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    reviewPromptEvent: { updateMany: (...args: unknown[]) => promptEventUpdateMany(...args) },
    reviewEmailSequence: { updateMany: (...args: unknown[]) => emailSequenceUpdateMany(...args) },
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

const notifyAdmins = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notifyAdmins: (...args: unknown[]) => notifyAdmins(...args) }));

const { GET, POST } = await import("./route");

function get(url: string) {
  return GET(new NextRequest(url));
}
function post(body: unknown, token: string | null = "tok") {
  return POST(
    new NextRequest("http://localhost/api/reviews", {
      method: "POST",
      body: JSON.stringify(body),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  listPublishedReviews.mockResolvedValue({ items: [], nextCursor: null });
  getReviewSummary.mockResolvedValue({ average: 0, count: 0, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } });
  isEligibleToSubmit.mockResolvedValue({ eligible: true });
  computeVerifiedCustomer.mockResolvedValue({ verified: false, tier: null });
  userFindUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) });
  isDuplicateReviewBody.mockResolvedValue(false);
  computeSpamScore.mockReturnValue({ score: 0, flags: [] });
  getReviewSettings.mockResolvedValue({ spamScoreAutoHideThreshold: 90, autoHideReportThreshold: 3, promptThrottleDays: 21, promptMaxLifetime: 3, minAccountAgeHours: 0, requireProductUsage: true });
});

describe("GET /api/reviews", () => {
  it("returns items, nextCursor, and summary", async () => {
    listPublishedReviews.mockResolvedValue({ items: [{ id: "r1" }], nextCursor: "20" });
    const res = await get("http://localhost/api/reviews");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.items).toEqual([{ id: "r1" }]);
    expect(data.nextCursor).toBe("20");
    expect(data.summary.count).toBe(0);
  });

  it("400s on an invalid query", async () => {
    const res = await get("http://localhost/api/reviews?rating=99");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/reviews", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await post({ rating: 5, body: "a".repeat(30), featureUsed: "auto_clips" });
    expect(res.status).toBe(401);
  });

  it("403s with not_eligible when ineligible", async () => {
    isEligibleToSubmit.mockResolvedValue({ eligible: false, reason: "no_product_usage" });
    const res = await post({ rating: 5, body: "a".repeat(30), featureUsed: "auto_clips" });
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.code).toBe("not_eligible");
    expect(data.reason).toBe("no_product_usage");
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("400s on a malformed body", async () => {
    const res = await post({ rating: 9, body: "too short", featureUsed: "auto_clips" });
    expect(res.status).toBe(400);
  });

  it("creates a pending review on a valid, eligible submission", async () => {
    computeVerifiedCustomer.mockResolvedValue({ verified: true, tier: "pro" });
    reviewCreate.mockResolvedValue({ id: "rev-1", status: "pending" });
    const res = await post({ rating: 5, title: "Great!", body: "a".repeat(30), featureUsed: "auto_clips" });
    expect(res.status).toBe(201);
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          rating: 5,
          status: "pending",
          verifiedCustomer: true,
          tierAtSubmit: "pro",
        }),
      }),
    );
  });

  it("409s when a review already exists (unique constraint)", async () => {
    reviewCreate.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await post({ rating: 5, body: "a".repeat(30), featureUsed: "auto_clips" });
    expect(res.status).toBe(409);
  });

  it("auto-hides a submission that scores above the spam threshold", async () => {
    computeSpamScore.mockReturnValue({ score: 95, flags: ["multiple_urls"] });
    reviewCreate.mockResolvedValue({ id: "rev-1", status: "hidden" });
    const res = await post({ rating: 5, body: "a".repeat(30), featureUsed: "auto_clips" });
    expect(res.status).toBe(201);
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "hidden", spamScore: 95, spamFlags: ["multiple_urls"] }),
      }),
    );
    expect(notifyAdmins).toHaveBeenCalledWith("admin_review_spam_detected", expect.any(String), expect.any(String), "/admin/reviews/rev-1");
  });

  it("notifies admins of a normal new submission", async () => {
    reviewCreate.mockResolvedValue({ id: "rev-1", status: "pending" });
    await post({ rating: 5, body: "a".repeat(30), featureUsed: "auto_clips" });
    expect(notifyAdmins).toHaveBeenCalledWith("admin_review_new", expect.any(String), undefined, "/admin/reviews/rev-1");
  });

  it("passes wouldRecommend/publicDisplayConsent/company/country through to the created review", async () => {
    reviewCreate.mockResolvedValue({ id: "rev-1", status: "pending" });
    await post({
      rating: 5,
      body: "a".repeat(30),
      featureUsed: "auto_clips",
      wouldRecommend: true,
      publicDisplayConsent: false,
      company: "Acme Inc",
      country: "India",
    });
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wouldRecommend: true,
          publicDisplayConsent: false,
          company: "Acme Inc",
          country: "India",
        }),
      }),
    );
  });

  it("silently rejects a submission with the honeypot field filled", async () => {
    const res = await post({ rating: 5, body: "a".repeat(30), featureUsed: "auto_clips", hp: "i am a bot" });
    expect(res.status).toBe(400);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("attributes conversion to the open prompt event and cancels the email drip", async () => {
    reviewCreate.mockResolvedValue({ id: "rev-1", status: "pending" });
    await post({ rating: 5, body: "a".repeat(30), featureUsed: "auto_clips" });
    expect(promptEventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", convertedAt: null },
        data: expect.objectContaining({ reviewId: "rev-1" }),
      }),
    );
    expect(emailSequenceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", cancelledAt: null },
        data: expect.objectContaining({ cancelReason: "reviewed" }),
      }),
    );
  });
});
