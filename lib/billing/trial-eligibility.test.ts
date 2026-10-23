import { beforeEach, describe, expect, it, vi } from "vitest";

let user: { trialUsedAt: Date | null; subscriptionEndsAt: Date | null; canonicalEmail: string | null } | null;
let purchases = 0;
let siblingsWithTrial = 0;
const userCount = vi.fn(async () => siblingsWithTrial);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => user), count: userCount },
    purchase: { count: vi.fn(async () => purchases) },
  },
}));

const { trialEligibility } = await import("./trial-eligibility");

beforeEach(() => {
  user = { trialUsedAt: null, subscriptionEndsAt: null, canonicalEmail: "you@gmail.com" };
  purchases = 0;
  siblingsWithTrial = 0;
  userCount.mockClear();
});

describe("trialEligibility", () => {
  it("offers the trial to a first-time customer", async () => {
    expect(await trialEligibility("u1")).toBeNull();
  });

  it("refuses when another account on the same inbox already had it", async () => {
    siblingsWithTrial = 1;
    expect(await trialEligibility("u1")).toBe("trial-used");
    expect(userCount).toHaveBeenCalledWith({
      where: { canonicalEmail: "you@gmail.com", id: { not: "u1" }, trialUsedAt: { not: null } },
    });
  });

  it("skips the inbox check for accounts not yet backfilled", async () => {
    user = { trialUsedAt: null, subscriptionEndsAt: null, canonicalEmail: null };
    expect(await trialEligibility("u1")).toBeNull();
    expect(userCount).not.toHaveBeenCalled();
  });

  it("keeps the existing rules", async () => {
    user = { trialUsedAt: new Date(), subscriptionEndsAt: null, canonicalEmail: null };
    expect(await trialEligibility("u1")).toBe("trial-used");
    user = { trialUsedAt: null, subscriptionEndsAt: null, canonicalEmail: null };
    purchases = 1;
    expect(await trialEligibility("u1")).toBe("has-purchased");
  });
});
