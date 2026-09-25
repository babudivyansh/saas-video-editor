import { describe, expect, it } from "vitest";
import { addMonths, nextRefillAfter, recurringTerm, RENEWAL_GRACE_DAYS } from "./term";

const CHARGED = new Date("2026-10-01T10:00:00Z");
const DAY = 86_400_000;

/** Walk the refill cron's schedule from a term's first refill to its end. */
function refillsIn(firstRefill: Date | null, subscriptionEndsAt: Date, recurring: boolean): Date[] {
  const out: Date[] = [];
  for (let at = firstRefill; at; at = nextRefillAfter(at, subscriptionEndsAt, recurring)) out.push(at);
  return out;
}

describe("recurringTerm", () => {
  it("covers one month plus grace for a monthly plan, with no cron refills", () => {
    const t = recurringTerm(CHARGED, 1);
    expect(t.paidUntil).toEqual(addMonths(CHARGED, 1));
    expect(t.accessUntil.getTime() - t.paidUntil.getTime()).toBe(RENEWAL_GRACE_DAYS * DAY);
    expect(t.nextRefillAt).toBeNull();
  });

  it("covers the whole year for an annual plan, refilling from month 2", () => {
    const t = recurringTerm(CHARGED, 12);
    expect(t.paidUntil).toEqual(addMonths(CHARGED, 12));
    expect(t.nextRefillAt).toEqual(addMonths(CHARGED, 1));
  });

  it("treats a missing interval as monthly", () => {
    expect(recurringTerm(CHARGED, null).paidUntil).toEqual(addMonths(CHARGED, 1));
  });
});

describe("nextRefillAfter", () => {
  it("delivers exactly months 2–12 of a recurring annual term — never a 13th on the renewal date", () => {
    const t = recurringTerm(CHARGED, 12);
    const refills = refillsIn(t.nextRefillAt, t.accessUntil, true);
    expect(refills).toHaveLength(11); // + the charge's own month = 12
    expect(refills.at(-1)).toEqual(addMonths(CHARGED, 11));
    expect(refills.every((r) => r < t.paidUntil)).toBe(true);
  });

  it("keeps the prepaid (non-recurring) annual schedule unchanged", () => {
    const endsAt = addMonths(CHARGED, 12); // prepaid terms carry no grace
    const refills = refillsIn(addMonths(CHARGED, 1), endsAt, false);
    expect(refills).toHaveLength(11);
    expect(refills.at(-1)).toEqual(addMonths(CHARGED, 11));
  });

  it("keeps refilling when there is no term end on record", () => {
    expect(nextRefillAfter(CHARGED, null, true)).toEqual(addMonths(CHARGED, 1));
  });
});
