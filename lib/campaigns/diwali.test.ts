import { afterEach, describe, expect, it, vi } from "vitest";
import { DIWALI, diwaliDiscountMinor, diwaliMonthlyBonus, diwaliMonthlyBonusApplies, diwaliOfferApplies, diwaliOfferFor, diwaliPhase, isDiwaliOfferLive } from "./diwali";

const BEFORE = Date.parse("2026-11-07T23:59:59+05:30");
const LAUNCH = DIWALI.launchAt;
const LAST_MINUTE = Date.parse("2026-11-15T23:59:00+05:30");
const AFTER = Date.parse("2026-11-16T00:00:00+05:30");

const yearlyInr = { intervalMonths: 12, currency: "INR" as const, trial: false };

afterEach(() => vi.unstubAllEnvs());

describe("diwaliPhase", () => {
  it("counts down before launch, is live through 15 Nov IST, then over", () => {
    expect(diwaliPhase(BEFORE)).toBe("countdown");
    expect(diwaliPhase(LAUNCH)).toBe("live");
    expect(diwaliPhase(LAST_MINUTE)).toBe("live");
    expect(diwaliPhase(AFTER)).toBe("over");
  });
});

describe("Diwali offer", () => {
  it("is never live or applied without a configured offer id", () => {
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_DIWALI_OFFER_ID", "");
    expect(isDiwaliOfferLive(LAUNCH)).toBe(false);
    expect(diwaliOfferFor(yearlyInr, LAUNCH)).toBeUndefined();
  });

  it("applies only to new yearly INR non-trial checkouts inside the window", () => {
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_DIWALI_OFFER_ID", " offer_test123 ");
    expect(diwaliOfferFor(yearlyInr, LAUNCH)).toBe("offer_test123");
    expect(diwaliOfferFor(yearlyInr, LAST_MINUTE)).toBe("offer_test123");
    expect(diwaliOfferFor(yearlyInr, BEFORE)).toBeUndefined();
    expect(diwaliOfferFor(yearlyInr, AFTER)).toBeUndefined();
    expect(diwaliOfferApplies({ ...yearlyInr, intervalMonths: 1 }, LAUNCH)).toBe(false);
    expect(diwaliOfferApplies({ ...yearlyInr, currency: "USD" }, LAUNCH)).toBe(false);
    expect(diwaliOfferApplies({ ...yearlyInr, trial: true }, LAUNCH)).toBe(false);
  });

  it("discounts 10% of the first payment", () => {
    expect(diwaliDiscountMinor(1_000_000)).toBe(100_000);
  });
});

describe("Diwali monthly bonus", () => {
  it("applies to monthly plans inside the window only — no Razorpay offer needed", () => {
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_DIWALI_OFFER_ID", "");
    expect(diwaliMonthlyBonusApplies({ intervalMonths: 1 }, LAUNCH)).toBe(true);
    expect(diwaliMonthlyBonusApplies({ intervalMonths: 1 }, LAST_MINUTE)).toBe(true);
    expect(diwaliMonthlyBonusApplies({ intervalMonths: 1 }, BEFORE)).toBe(false);
    expect(diwaliMonthlyBonusApplies({ intervalMonths: 1 }, AFTER)).toBe(false);
    expect(diwaliMonthlyBonusApplies({ intervalMonths: 12 }, LAUNCH)).toBe(false);
  });

  it("is 50% of the allowance, rounded up", () => {
    expect(diwaliMonthlyBonus(60, 20)).toEqual({ minutes: 30, credits: 10 });
    expect(diwaliMonthlyBonus(25, 7)).toEqual({ minutes: 13, credits: 4 });
  });
});
