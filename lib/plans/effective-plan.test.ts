// One definition of "what plan is this account on", pinned.
//
// There used to be three, and they disagreed. An account with `planId` set and
// `subscriptionEndsAt` NULL read as the paid plan in the admin panel and on the
// settings page, and as "Free" in the dashboard header and in every server-side
// entitlement check. The admin surface was the one ignoring expiry, so the
// person best placed to notice the problem was the one shown the wrong answer.

import { afterEach, describe, expect, it, vi } from "vitest";
import { effectivePlan, planDisplayName } from "./effective-plan";

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);
const CREATOR = { name: "Creator", tier: "creator" };

afterEach(() => vi.useRealTimers());

describe("effectivePlan", () => {
  it("resolves an active subscription to its tier", () => {
    const state = effectivePlan({ plan: CREATOR, subscriptionEndsAt: FUTURE });
    expect(state).toMatchObject({
      tier: "creator",
      isActive: true,
      isExpired: false,
      activePlanName: "Creator",
      expiredPlanName: null,
    });
  });

  // The reported bug's exact state.
  it("treats a plan with a NULL end date as expired, not active", () => {
    const state = effectivePlan({ plan: CREATOR, subscriptionEndsAt: null });
    expect(state).toMatchObject({
      tier: "free",
      isActive: false,
      isExpired: true,
      activePlanName: null,
      expiredPlanName: "Creator",
    });
  });

  it("treats a past end date as expired", () => {
    const state = effectivePlan({ plan: CREATOR, subscriptionEndsAt: PAST });
    expect(state).toMatchObject({ tier: "free", isActive: false, isExpired: true });
  });

  it("reports no plan as free but NOT expired — nothing lapsed", () => {
    const state = effectivePlan({ plan: null, subscriptionEndsAt: null });
    expect(state).toMatchObject({ tier: "free", isActive: false, isExpired: false, expiredPlanName: null });
  });

  // Plan.tier is nullable, so a misconfigured subscription row is possible.
  // The term is genuinely running; only the entitlement is unresolvable.
  it("resolves a live term with a null tier to free while staying active", () => {
    const state = effectivePlan({ plan: { name: "Mystery", tier: null }, subscriptionEndsAt: FUTURE });
    expect(state.tier).toBe("free");
    expect(state.isActive).toBe(true);
    expect(state.activePlanName).toBe("Mystery");
  });

  it("accepts an ISO string, as the client payload provides", () => {
    expect(effectivePlan({ plan: CREATOR, subscriptionEndsAt: FUTURE.toISOString() }).tier).toBe("creator");
    expect(effectivePlan({ plan: CREATOR, subscriptionEndsAt: PAST.toISOString() }).tier).toBe("free");
  });

  it("treats an unparseable date as no term rather than throwing", () => {
    expect(effectivePlan({ plan: CREATOR, subscriptionEndsAt: "not a date" })).toMatchObject({
      tier: "free",
      isActive: false,
    });
  });

  it("handles a null or undefined account", () => {
    expect(effectivePlan(null).tier).toBe("free");
    expect(effectivePlan(undefined).isExpired).toBe(false);
  });

  it("expires exactly at the boundary, not a moment after", () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-03T12:00:00.000Z");
    vi.setSystemTime(now);
    expect(effectivePlan({ plan: CREATOR, subscriptionEndsAt: now }).isActive).toBe(false);
    expect(
      effectivePlan({ plan: CREATOR, subscriptionEndsAt: new Date(now.getTime() + 1) }).isActive,
    ).toBe(true);
  });
});

describe("planDisplayName", () => {
  const labels = { free: "Free", activeFallback: "Pro" };

  it("shows the plan name only while the term is live", () => {
    expect(planDisplayName({ plan: CREATOR, subscriptionEndsAt: FUTURE }, labels)).toBe("Creator");
    expect(planDisplayName({ plan: CREATOR, subscriptionEndsAt: PAST }, labels)).toBe("Free");
    expect(planDisplayName({ plan: CREATOR, subscriptionEndsAt: null }, labels)).toBe("Free");
  });

  it("falls back for a live term whose plan row is missing", () => {
    expect(planDisplayName({ plan: null, subscriptionEndsAt: FUTURE }, labels)).toBe("Pro");
  });

  it("uses the free label when no fallback is supplied", () => {
    expect(planDisplayName({ plan: null, subscriptionEndsAt: FUTURE }, { free: "Free" })).toBe("Free");
  });

  // The header and the settings tile now pass the same account through the
  // same function, so they cannot disagree the way they used to.
  it("gives every surface the same answer for the same account", () => {
    const account = { plan: CREATOR, subscriptionEndsAt: null };
    const header = planDisplayName(account, { free: "Free", activeFallback: "Pro" });
    const settings = planDisplayName(account, { free: "Free" });
    expect(header).toBe(settings);
    expect(header).toBe("Free");
  });
});
