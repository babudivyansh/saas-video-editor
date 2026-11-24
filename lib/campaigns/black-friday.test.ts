import { describe, expect, it } from "vitest";
import {
  BLACK_FRIDAY, BF26_PLAN_NOTE, bfPackBonus, bfPackBonusApplies, bfPlanBonus, bfPlanBonusAppliesAtCheckout,
  bfPlanBonusEligibleAtCharge, blackFridayPhase, hasRunningPaidPlan,
} from "./black-friday";

const BEFORE = Date.parse("2026-11-24T16:59:59+05:30");
const OPEN = Date.parse("2026-11-24T17:00:00+05:30");
const LAST_SECOND = Date.parse("2026-11-30T23:59:59+05:30");
const AFTER = Date.parse("2026-12-01T00:00:00+05:30");
const DAY = 86_400_000;

describe("blackFridayPhase — window edges in IST", () => {
  it("opens at 5:00 PM IST on 24 Nov (11:30 UTC)", () => {
    expect(new Date(BLACK_FRIDAY.startsAt).toISOString()).toBe("2026-11-24T11:30:00.000Z");
    expect(blackFridayPhase(BEFORE)).toBe("before");
    expect(blackFridayPhase(OPEN)).toBe("live");
  });

  it("stays live through 23:59:59 IST on 30 Nov, then is over", () => {
    expect(new Date(BLACK_FRIDAY.endsAt).toISOString()).toBe("2026-11-30T18:29:59.000Z");
    expect(blackFridayPhase(LAST_SECOND)).toBe("live");
    expect(blackFridayPhase(LAST_SECOND + 1000)).toBe("over");
    expect(blackFridayPhase(AFTER)).toBe("over");
  });
});

describe("minute packs", () => {
  it("applies to Clip Minutes packs in the window only — never AI credit packs", () => {
    expect(bfPackBonusApplies("minute_pack", OPEN)).toBe(true);
    expect(bfPackBonusApplies("minute_pack", LAST_SECOND)).toBe(true);
    expect(bfPackBonusApplies("minute_pack", BEFORE)).toBe(false);
    expect(bfPackBonusApplies("minute_pack", AFTER)).toBe(false);
    expect(bfPackBonusApplies("pack", OPEN)).toBe(false);
    expect(bfPackBonusApplies("subscription", OPEN)).toBe(false);
  });

  it("doubles the pack (bonus = 100% of its minutes)", () => {
    expect(bfPackBonus(100)).toBe(100);
    expect(bfPackBonus(300)).toBe(300);
    expect(bfPackBonus(1000)).toBe(1000);
    expect(bfPackBonus(0)).toBe(0);
  });
});

describe("plans — eligibility at checkout", () => {
  const fresh = { kind: "subscription", subscriptionEndsAt: null, trialEndsAt: null };

  it("stamps a new subscription bought in the window, monthly or yearly alike", () => {
    expect(bfPlanBonusAppliesAtCheckout(fresh, OPEN)).toBe(true);
    expect(bfPlanBonusAppliesAtCheckout(fresh, LAST_SECOND)).toBe(true);
    expect(bfPlanBonusAppliesAtCheckout(fresh, BEFORE)).toBe(false);
    expect(bfPlanBonusAppliesAtCheckout(fresh, AFTER)).toBe(false);
  });

  it("only plans qualify, not packs", () => {
    expect(bfPlanBonusAppliesAtCheckout({ ...fresh, kind: "minute_pack" }, OPEN)).toBe(false);
    expect(bfPlanBonusAppliesAtCheckout({ ...fresh, kind: "pack" }, OPEN)).toBe(false);
  });

  it("refuses an upgrade/switch from a paid plan that is still running", () => {
    const paid = { ...fresh, subscriptionEndsAt: new Date(OPEN + 10 * DAY) };
    expect(hasRunningPaidPlan(paid, OPEN)).toBe(true);
    expect(bfPlanBonusAppliesAtCheckout(paid, OPEN)).toBe(false);
  });

  it("treats a lapsed plan as a new subscription", () => {
    const lapsed = { ...fresh, subscriptionEndsAt: new Date(OPEN - DAY) };
    expect(bfPlanBonusAppliesAtCheckout(lapsed, OPEN)).toBe(true);
  });

  it("treats a running (unpaid) trial as not yet subscribed", () => {
    const trialing = { ...fresh, subscriptionEndsAt: new Date(OPEN + 2 * DAY), trialEndsAt: new Date(OPEN + 2 * DAY) };
    expect(hasRunningPaidPlan(trialing, OPEN)).toBe(false);
    expect(bfPlanBonusAppliesAtCheckout(trialing, OPEN)).toBe(true);
  });
});

describe("plans — eligibility at the first charge (trial carry-over)", () => {
  it("honours the checkout stamp even when the charge lands after 30 Nov", () => {
    expect(bfPlanBonusEligibleAtCharge({ note: BF26_PLAN_NOTE, trialEndsAt: new Date(AFTER) }, AFTER + 2 * DAY)).toBe(true);
    expect(bfPlanBonusEligibleAtCharge({ note: BF26_PLAN_NOTE, trialEndsAt: null }, AFTER)).toBe(true);
  });

  it("gives a pre-window trial the bonus when it converts inside the window", () => {
    expect(bfPlanBonusEligibleAtCharge({ note: undefined, trialEndsAt: new Date(OPEN) }, OPEN + 1000)).toBe(true);
    expect(bfPlanBonusEligibleAtCharge({ note: undefined, trialEndsAt: new Date(AFTER) }, AFTER)).toBe(false);
    expect(bfPlanBonusEligibleAtCharge({ note: undefined, trialEndsAt: new Date(BEFORE) }, BEFORE)).toBe(false);
  });

  it("never gives an unstamped, non-trial charge (a renewal) anything", () => {
    expect(bfPlanBonusEligibleAtCharge({ note: undefined, trialEndsAt: null }, OPEN)).toBe(false);
    expect(bfPlanBonusEligibleAtCharge({ note: "pack", trialEndsAt: null }, OPEN)).toBe(false);
  });

  it("is one month of Clip Minutes: Creator 200, Pro 400, Agency 1,000", () => {
    expect(bfPlanBonus(200)).toBe(200);
    expect(bfPlanBonus(400)).toBe(400);
    expect(bfPlanBonus(1000)).toBe(1000);
    expect(bfPlanBonus(0)).toBe(0);
  });
});
