import { describe, expect, it } from "vitest";
import { trialDaysLeftLabel, trialStatus } from "./trial-status";

const NOW = new Date("2026-09-26T10:00:00Z");
const DAY = 86_400_000;

describe("trialStatus", () => {
  it("is null with no trial, or once the trial has ended", () => {
    expect(trialStatus(null, NOW)).toBeNull();
    expect(trialStatus({ trialEndsAt: null }, NOW)).toBeNull();
    expect(trialStatus({ trialEndsAt: new Date(NOW.getTime() - 1) }, NOW)).toBeNull();
  });

  it("reports the end date and days left, rounding up", () => {
    const t = trialStatus({ trialEndsAt: new Date(NOW.getTime() + 6.2 * DAY).toISOString() }, NOW);
    expect(t).toMatchObject({ daysLeft: 7, cancelled: false });
    expect(t?.endsAt.getTime()).toBe(NOW.getTime() + 6.2 * DAY);
  });

  it("flags a trial cancelled during the trial", () => {
    expect(trialStatus({ trialEndsAt: new Date(NOW.getTime() + DAY), subscriptionCancelledAt: NOW }, NOW)?.cancelled).toBe(true);
  });
});

describe("trialDaysLeftLabel", () => {
  it("reads naturally", () => {
    expect(trialDaysLeftLabel(0)).toBe("Ends today");
    expect(trialDaysLeftLabel(1)).toBe("1 day left");
    expect(trialDaysLeftLabel(6)).toBe("6 days left");
  });
});
