import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/razorpay-client", () => ({ createRazorpay: () => ({ subscriptions: { cancel: vi.fn() } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { unrefilledMonths, wholeMonthsBetween } = await import("./subscription-switch");

describe("unrefilledMonths — paid months a switch would otherwise forfeit", () => {
  const start = new Date("2026-01-15T10:00:00Z");

  it("is 0 on a monthly plan (this month's grant is already in the balance)", () => {
    expect(unrefilledMonths(1, start, new Date("2026-01-20T00:00:00Z"))).toBe(0);
  });

  it("counts the yearly refills not yet delivered", () => {
    // Month 1 granted at purchase, month 2 on 15 Feb, month 3 on 15 Mar.
    expect(unrefilledMonths(12, start, new Date("2026-03-20T00:00:00Z"))).toBe(9);
    // Day one of the term: 11 refills still to come.
    expect(unrefilledMonths(12, start, start)).toBe(11);
  });

  it("never goes below 0 past the term", () => {
    expect(unrefilledMonths(12, start, new Date("2027-06-01T00:00:00Z"))).toBe(0);
  });

  it("floors partial months", () => {
    expect(wholeMonthsBetween(start, new Date("2026-02-14T00:00:00Z"))).toBe(0);
    expect(wholeMonthsBetween(start, new Date("2026-02-16T00:00:00Z"))).toBe(1);
  });
});
