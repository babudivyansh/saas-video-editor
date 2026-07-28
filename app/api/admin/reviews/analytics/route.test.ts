import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const NOW = new Date("2026-07-20T12:00:00.000Z");
vi.useFakeTimers();
vi.setSystemTime(NOW);

let reviews: Array<{ createdAt: Date; rating: number }>;
let ratingGrouped: Array<{ rating: number; _count: number }>;
let featureGrouped: Array<{ featureUsed: string; _count: number; _avg: { rating: number | null } }>;
let votes: Array<{ createdAt: Date; value: number }>;
let promptEvents: Array<{ trigger: string; dismissedAt: Date | null; permanentDismiss: boolean; convertedAt: Date | null }>;
let emailSequences: Array<{
  email1SentAt: Date | null; email1OpenedAt: Date | null; email1ClickedAt: Date | null;
  email2SentAt: Date | null; email2OpenedAt: Date | null; email2ClickedAt: Date | null;
  email3SentAt: Date | null; email3OpenedAt: Date | null; email3ClickedAt: Date | null;
  cancelledAt: Date | null; cancelReason: string | null;
}>;
let impressions: Array<{ date: string; count: number }>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findMany: vi.fn(async ({ where }: { where: { user?: unknown } }) => {
        // The two churn-cohort queries pass a `user` filter; the base trend
        // query does not — route them to the right fixture.
        if (where.user) return [];
        return reviews;
      }),
      groupBy: vi.fn(async ({ by }: { by: string[] }) => (by[0] === "rating" ? ratingGrouped : featureGrouped)),
      count: vi.fn(async () => reviews.length),
    },
    reviewHelpfulVote: { findMany: vi.fn(async () => votes) },
    reviewPromptEvent: { findMany: vi.fn(async () => promptEvents) },
    reviewEmailSequence: { findMany: vi.fn(async () => emailSequences) },
    testimonialImpression: { findMany: vi.fn(async () => impressions) },
    user: { count: vi.fn(async () => 10) },
    reviewReport: { count: vi.fn(async () => 2) },
  },
}));

const { GET } = await import("./route");

function get(range = 7) {
  return GET(new NextRequest(`http://localhost/api/admin/reviews/analytics?range=${range}`));
}

beforeEach(() => {
  reviews = [
    { createdAt: new Date("2026-07-18T10:00:00Z"), rating: 5 },
    { createdAt: new Date("2026-07-19T10:00:00Z"), rating: 3 },
  ];
  ratingGrouped = [
    { rating: 5, _count: 1 },
    { rating: 3, _count: 1 },
  ];
  featureGrouped = [{ featureUsed: "auto_clips", _count: 2, _avg: { rating: 4 } }];
  votes = [{ createdAt: new Date("2026-07-19T10:00:00Z"), value: 1 }];
  promptEvents = [];
  emailSequences = [];
  impressions = [];
});

describe("GET /api/admin/reviews/analytics", () => {
  it("returns a dense day series covering the requested range", async () => {
    const res = await get(7);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.submissionsOverTime).toHaveLength(8); // inclusive of both endpoints
    expect(data.submissionsOverTime.find((d: { date: string }) => d.date === "2026-07-18").count).toBe(1);
    expect(data.submissionsOverTime.find((d: { date: string }) => d.date === "2026-07-19").count).toBe(1);
  });

  it("computes rating distribution across all 5 stars, defaulting missing ones to 0", async () => {
    const res = await get(7);
    const data = await res.json();
    expect(data.ratingDistribution).toEqual([
      { rating: 1, count: 0 },
      { rating: 2, count: 0 },
      { rating: 3, count: 1 },
      { rating: 4, count: 0 },
      { rating: 5, count: 1 },
    ]);
  });

  it("buckets sentiment from the rating distribution", async () => {
    const res = await get(7);
    const data = await res.json();
    expect(data.sentiment).toEqual({ positive: 1, neutral: 1, negative: 0 });
  });

  it("computes conversion rate from eligible users vs reviews submitted", async () => {
    const res = await get(7);
    const data = await res.json();
    expect(data.conversionRate).toEqual({ eligibleUsers: 10, reviewsSubmitted: 2, rate: 20 });
  });

  it("includes total reviews and open reports for the KPI row", async () => {
    const res = await get(7);
    const data = await res.json();
    expect(data.totalReviews).toBe(2);
    expect(data.openReportsCount).toBe(2);
  });

  it("sorts mostReviewedFeatures by count desc and featureSatisfaction (and mostLovedFeatures) by rating desc", async () => {
    featureGrouped = [
      { featureUsed: "auto_clips", _count: 5, _avg: { rating: 3 } },
      { featureUsed: "assets", _count: 1, _avg: { rating: 5 } },
    ];
    const res = await get(7);
    const data = await res.json();
    expect(data.mostReviewedFeatures[0].featureUsed).toBe("auto_clips");
    expect(data.featureSatisfaction[0].featureUsed).toBe("assets");
    expect(data.mostLovedFeatures[0].featureUsed).toBe("assets");
  });

  it("computes the prompt funnel per trigger", async () => {
    promptEvents = [
      { trigger: "export_complete", dismissedAt: null, permanentDismiss: false, convertedAt: new Date() },
      { trigger: "export_complete", dismissedAt: new Date(), permanentDismiss: false, convertedAt: null },
      { trigger: "export_complete", dismissedAt: new Date(), permanentDismiss: true, convertedAt: null },
      { trigger: "autoclips_milestone", dismissedAt: null, permanentDismiss: false, convertedAt: null },
    ];
    const res = await get(7);
    const data = await res.json();
    const exportRow = data.promptFunnel.find((r: { trigger: string }) => r.trigger === "export_complete");
    expect(exportRow).toEqual({
      trigger: "export_complete", shown: 3, dismissed: 2, permanentDismiss: 1, converted: 1,
      dismissalRate: 66.7, conversionRate: 33.3,
    });
    // Sorted by shown desc.
    expect(data.promptFunnel[0].trigger).toBe("export_complete");
  });

  it("computes per-stage email drip sent/open/click rates and cancellation breakdown", async () => {
    emailSequences = [
      {
        email1SentAt: new Date(), email1OpenedAt: new Date(), email1ClickedAt: new Date(),
        email2SentAt: null, email2OpenedAt: null, email2ClickedAt: null,
        email3SentAt: null, email3OpenedAt: null, email3ClickedAt: null,
        cancelledAt: new Date(), cancelReason: "reviewed",
      },
      {
        email1SentAt: new Date(), email1OpenedAt: null, email1ClickedAt: null,
        email2SentAt: new Date(), email2OpenedAt: new Date(), email2ClickedAt: null,
        email3SentAt: null, email3OpenedAt: null, email3ClickedAt: null,
        cancelledAt: null, cancelReason: null,
      },
      {
        email1SentAt: null, email1OpenedAt: null, email1ClickedAt: null,
        email2SentAt: null, email2OpenedAt: null, email2ClickedAt: null,
        email3SentAt: null, email3OpenedAt: null, email3ClickedAt: null,
        cancelledAt: new Date(), cancelReason: "opted_out",
      },
    ];
    const res = await get(7);
    const data = await res.json();
    expect(data.emailDripStats).toEqual({
      stage1: { sent: 2, opened: 1, clicked: 1, openRate: 50, clickRate: 50 },
      stage2: { sent: 1, opened: 1, clicked: 0, openRate: 100, clickRate: 0 },
      stage3: { sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 },
      cancelledReviewed: 1,
      cancelledOptedOut: 1,
      totalSequences: 3,
    });
  });

  it("returns a dense testimonial-impression day series", async () => {
    impressions = [{ date: "2026-07-19", count: 42 }];
    const res = await get(7);
    const data = await res.json();
    expect(data.testimonialImpressions.find((d: { date: string }) => d.date === "2026-07-19").count).toBe(42);
    expect(data.testimonialImpressions.find((d: { date: string }) => d.date === "2026-07-18").count).toBe(0);
  });
});
