import { describe, expect, it } from "vitest";
import {
  ENTRY_PACK_SLUG, isUpgradePlacement, listableMinutePacks, placementFromSource,
} from "./conversion";
import { overPlanLimit } from "./autoclip-source";
import {
  FREE_TIER_MONTHLY_BONUS_MINUTES, FREE_TIER_SIGNUP_MINUTES, TRIAL_MINUTES, maxUploadBytesForTier,
} from "./plans/tiers";

describe("conversion placements", () => {
  it("accepts only the known placements", () => {
    expect(isUpgradePlacement("file_limit")).toBe(true);
    expect(isUpgradePlacement("nope")).toBe(false);
    expect(isUpgradePlacement(42)).toBe(false);
  });

  it("maps an email link's ?src= to the email placement", () => {
    expect(placementFromSource("email_low_minutes")).toBe("email");
    expect(placementFromSource("low_minutes")).toBe("low_minutes");
    expect(placementFromSource("something-else")).toBe("other");
    expect(placementFromSource(null)).toBe("other");
  });
});

describe("listableMinutePacks", () => {
  const packs = [{ slug: ENTRY_PACK_SLUG }, { slug: "minutes_100" }];
  it("lists the First Pack until the account's first purchase", () => {
    expect(listableMinutePacks(packs, { hasPurchased: false }).map((p) => p.slug)).toEqual([ENTRY_PACK_SLUG, "minutes_100"]);
    expect(listableMinutePacks(packs, null).map((p) => p.slug)).toEqual([ENTRY_PACK_SLUG, "minutes_100"]);
    expect(listableMinutePacks(packs, { hasPurchased: true }).map((p) => p.slug)).toEqual(["minutes_100"]);
  });
});

describe("the 2026-11-26 free plan", () => {
  it("is a taste, and the trial gives more than free does", () => {
    expect(FREE_TIER_SIGNUP_MINUTES).toBe(15);
    expect(FREE_TIER_MONTHLY_BONUS_MINUTES).toBe(10);
    expect(TRIAL_MINUTES).toBeGreaterThan(FREE_TIER_SIGNUP_MINUTES);
  });
  it("takes 1 GB files", () => {
    expect(maxUploadBytesForTier("free")).toBe(1024 ** 3);
  });
});

describe("overPlanLimit", () => {
  it("is true only for a plan limit, never while the plan is unknown", () => {
    expect(overPlanLimit({ size: 2 * 1024 ** 3 }, null, "free")).toBe(true);
    expect(overPlanLimit({ size: 2 * 1024 ** 3 }, null, "pro")).toBe(false);
    expect(overPlanLimit(null, 31 * 60, "free")).toBe(true);
    expect(overPlanLimit(null, 29 * 60, "free")).toBe(false);
    expect(overPlanLimit({ size: 10 * 1024 ** 3 }, 10_000, null)).toBe(false);
  });
});
