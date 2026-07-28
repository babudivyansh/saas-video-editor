import { beforeEach, describe, expect, it, vi } from "vitest";

let reviewByUserId: Map<string, { id: string }>;
let userById: Map<string, { firstVideoAt: Date | null; createdAt: Date; trialEndsAt: Date | null }>;
let completedGenerationUserIds: Set<string>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => reviewByUserId.get(where.userId) ?? null),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => userById.get(where.id) ?? null),
    },
    generation: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; status: string } }) =>
        completedGenerationUserIds.has(where.userId) ? { id: "gen-1" } : null,
      ),
    },
  },
}));

const getUserTier = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserTier: (...args: unknown[]) => getUserTier(...args) }));

const isFeatureEnabled = vi.fn();
vi.mock("@/lib/flags", () => ({ isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args) }));

let reviewSettings: { minAccountAgeHours: number; requireProductUsage: boolean };
vi.mock("@/lib/reviews/settings", () => ({
  getReviewSettings: vi.fn(async () => reviewSettings),
}));

const { isEligibleToSubmit, computeVerifiedCustomer } = await import("./eligibility");

beforeEach(() => {
  reviewByUserId = new Map();
  userById = new Map();
  completedGenerationUserIds = new Set();
  reviewSettings = { minAccountAgeHours: 0, requireProductUsage: true };
  getUserTier.mockReset();
  isFeatureEnabled.mockReset().mockResolvedValue(false);
});

describe("isEligibleToSubmit", () => {
  it("rejects a user who already has a review", async () => {
    reviewByUserId.set("u1", { id: "rev-1" });
    userById.set("u1", { firstVideoAt: new Date(), createdAt: new Date(), trialEndsAt: null });
    const result = await isEligibleToSubmit("u1");
    expect(result).toEqual({ eligible: false, reason: "already_reviewed" });
  });

  it("rejects a user with no product usage and no completed generation", async () => {
    userById.set("u1", { firstVideoAt: null, createdAt: new Date(), trialEndsAt: null });
    const result = await isEligibleToSubmit("u1");
    expect(result).toEqual({ eligible: false, reason: "no_product_usage" });
  });

  it("allows a user with firstVideoAt set", async () => {
    userById.set("u1", { firstVideoAt: new Date(), createdAt: new Date(), trialEndsAt: null });
    const result = await isEligibleToSubmit("u1");
    expect(result).toEqual({ eligible: true });
  });

  it("falls back to a completed Generation when firstVideoAt is null", async () => {
    userById.set("u1", { firstVideoAt: null, createdAt: new Date(), trialEndsAt: null });
    completedGenerationUserIds.add("u1");
    const result = await isEligibleToSubmit("u1");
    expect(result).toEqual({ eligible: true });
  });

  it("enforces minAccountAgeHours when configured", async () => {
    reviewSettings = { minAccountAgeHours: 48, requireProductUsage: true };
    userById.set("u1", { firstVideoAt: new Date(), createdAt: new Date(), trialEndsAt: null });
    const result = await isEligibleToSubmit("u1");
    expect(result).toEqual({ eligible: false, reason: "account_too_new" });
  });
});

describe("computeVerifiedCustomer", () => {
  it("marks creator+ tiers as verified", async () => {
    getUserTier.mockResolvedValue("pro");
    const result = await computeVerifiedCustomer("u1");
    expect(result).toEqual({ verified: true, tier: "pro" });
  });

  it("does not verify free/trial users by default", async () => {
    getUserTier.mockResolvedValue("free");
    userById.set("u1", { firstVideoAt: new Date(), createdAt: new Date(), trialEndsAt: new Date(Date.now() + 1000 * 60 * 60) });
    const result = await computeVerifiedCustomer("u1");
    expect(result).toEqual({ verified: false, tier: null });
  });

  it("verifies an active trial user when the feature flag is enabled", async () => {
    getUserTier.mockResolvedValue("free");
    isFeatureEnabled.mockResolvedValue(true);
    userById.set("u1", { firstVideoAt: new Date(), createdAt: new Date(), trialEndsAt: new Date(Date.now() + 1000 * 60 * 60) });
    const result = await computeVerifiedCustomer("u1");
    expect(result).toEqual({ verified: true, tier: "creator" });
  });

  it("does not verify an expired trial even with the flag enabled", async () => {
    getUserTier.mockResolvedValue("free");
    isFeatureEnabled.mockResolvedValue(true);
    userById.set("u1", { firstVideoAt: new Date(), createdAt: new Date(), trialEndsAt: new Date(Date.now() - 1000) });
    const result = await computeVerifiedCustomer("u1");
    expect(result).toEqual({ verified: false, tier: null });
  });
});
