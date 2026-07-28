import { beforeEach, describe, expect, it, vi } from "vitest";

const aggregate = vi.fn(async () => ({ _avg: { rating: 4.5 }, _count: 2 }));
const groupBy = vi.fn(async () => [{ rating: 5, _count: 1 }, { rating: 4, _count: 1 }]);
const findMany = vi.fn(async () => []);
const findFirst = vi.fn(async () => null);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      aggregate: (...args: unknown[]) => aggregate(...args),
      groupBy: (...args: unknown[]) => groupBy(...args),
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

vi.mock("@/lib/reviews/badges", () => ({
  computeReviewBadges: vi.fn(() => []),
  computeTopHelpfulThreshold: vi.fn(async () => 5),
}));

vi.mock("@/utils/s3-upload", () => ({
  getAssetReadUrl: vi.fn(async (key: string) => `https://signed.example.com/${key}`),
}));

const { getReviewSummary, listPublishedReviews, getPublishedReviewById } = await import("./queries");

beforeEach(() => {
  vi.clearAllMocks();
  aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 2 });
  groupBy.mockResolvedValue([{ rating: 5, _count: 1 }, { rating: 4, _count: 1 }]);
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(null);
});

describe("getReviewSummary", () => {
  it("counts every published review toward the aggregate, regardless of publicDisplayConsent", async () => {
    await getReviewSummary();
    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "published" } }));
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "published" } }));
  });
});

describe("listPublishedReviews", () => {
  it("excludes reviews without display consent", async () => {
    await listPublishedReviews({});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "published", publicDisplayConsent: true }) }),
    );
  });
});

describe("getPublishedReviewById", () => {
  it("excludes a review without display consent", async () => {
    await getPublishedReviewById("rev-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rev-1", status: "published", publicDisplayConsent: true } }),
    );
  });
});
