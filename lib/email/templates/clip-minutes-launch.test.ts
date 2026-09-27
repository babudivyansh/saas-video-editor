import { describe, expect, it } from "vitest";
import { clipMinutesLaunch } from "./billing";

const base = { name: "A", monthlyMinutes: 150, minutesBalance: 150, renewsAt: new Date("2026-10-20T00:00:00Z") };
const text = (d: ReturnType<typeof clipMinutesLaunch>) => JSON.stringify(d.blocks);

describe("clipMinutesLaunch — the switch-day notice", () => {
  it("tells a subscriber whose credits go down exactly what and when, and why", () => {
    const d = clipMinutesLaunch({ ...base, tier: "creator", newMonthlyCredits: 50, currentMonthlyCredits: 60 });
    expect(text(d)).toMatch(/60 until .*2026, then 50/);
    expect(text(d)).toMatch(/Why fewer AI credits/);
  });

  it("says nothing about a reduction when the grant does not change (Studio)", () => {
    const d = clipMinutesLaunch({ ...base, tier: "studio", monthlyMinutes: 1000, newMonthlyCredits: 400, currentMonthlyCredits: 400 });
    expect(text(d)).not.toMatch(/Why fewer/);
    expect(text(d)).not.toMatch(/ until /);
  });

  it("marks a free account's minutes as watermarked and never mentions a renewal", () => {
    const d = clipMinutesLaunch({ ...base, tier: "free", monthlyMinutes: 30, minutesBalance: 30, newMonthlyCredits: 10, currentMonthlyCredits: 10, renewsAt: null });
    expect(text(d)).toMatch(/30 \(watermarked\)/);
    expect(text(d)).not.toMatch(/renewal/);
  });

  it("puts the minutes balance in the subject", () => {
    expect(clipMinutesLaunch({ ...base, tier: "pro", monthlyMinutes: 400, minutesBalance: 412, newMonthlyCredits: 150, currentMonthlyCredits: 160 }).subject)
      .toMatch(/412 are in your account/);
  });
});
