import { describe, it, expect } from "vitest";
import { goalProgress, newlyHitGoals, newlyMissedGoals, type Goal } from "./goals";
import type { SeriesPoint } from "./series";

const NOW = new Date("2026-08-03T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    metric: "followers",
    target: 10_000,
    baseline: 9_000,
    startAt: daysAgo(30),
    dueAt: daysAhead(30),
    status: "active",
    ...over,
  };
}

/** `n` daily points ending at `end`, rising by `step`. */
function series(n: number, end: number, step: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(NOW.getTime() - (n - 1 - i) * 86_400_000);
    out.push({ date: d.toISOString().slice(0, 10), value: end - (n - 1 - i) * step });
  }
  return out;
}

describe("goalProgress measures from the baseline", () => {
  it("reads 0% at the baseline, not 90%", () => {
    // The whole point: someone who sets "reach 10k" while at 9k has done none
    // of the work, and a naive current/target would tell them they are 90% done.
    const p = goalProgress(goal(), series(30, 9_000, 0), NOW);
    expect(p.pct).toBe(0);
  });

  it("reads 50% at the midpoint between baseline and target", () => {
    expect(goalProgress(goal(), series(30, 9_500, 0), NOW).pct).toBe(50);
  });

  it("reads 100% and hit at the target", () => {
    const p = goalProgress(goal(), series(30, 10_000, 0), NOW);
    expect(p.pct).toBe(100);
    expect(p.hit).toBe(true);
  });

  it("clamps below zero when the account moves backwards", () => {
    expect(goalProgress(goal(), series(30, 8_000, 0), NOW).pct).toBe(0);
  });

  it("falls back to absolute progress when no baseline was captured", () => {
    const p = goalProgress(goal({ baseline: null }), series(30, 5_000, 0), NOW);
    expect(p.pct).toBe(50); // 5000 / 10000
  });

  it("returns nulls with no data rather than guessing", () => {
    const p = goalProgress(goal(), [], NOW);
    expect(p.current).toBeNull();
    expect(p.pct).toBeNull();
    expect(p.onTrack).toBeNull();
  });
});

describe("goalProgress pacing", () => {
  it("computes the rate still required per day", () => {
    // 9,500 now, 10,000 target, 30 days left → 500/30 ≈ 16.7/day.
    const p = goalProgress(goal(), series(30, 9_500, 0), NOW);
    expect(p.requiredDailyRate).toBeCloseTo(500 / 30, 3);
  });

  it("computes the rate achieved so far from the baseline", () => {
    // 9,000 → 9,600 over the 30 days since startAt → 20/day.
    const p = goalProgress(goal(), series(30, 9_600, 20), NOW);
    expect(p.actualDailyRate).toBeCloseTo(20, 3);
  });

  it("marks a goal on track when the achieved pace beats the required pace", () => {
    // 20/day achieved vs (10,000-9,600)/30 ≈ 13.3/day required.
    expect(goalProgress(goal(), series(30, 9_600, 20), NOW).onTrack).toBe(true);
  });

  it("marks a goal off track when the pace is too slow", () => {
    // 3.3/day achieved vs (10,000-9,100)/30 = 30/day required.
    expect(goalProgress(goal(), series(30, 9_100, 3), NOW).onTrack).toBe(false);
  });

  it("is not on track when the due date has passed unmet", () => {
    const p = goalProgress(goal({ dueAt: daysAgo(1) }), series(30, 9_500, 10), NOW);
    expect(p.overdue).toBe(true);
    expect(p.onTrack).toBe(false);
    expect(p.daysRemaining).toBe(0);
  });

  it("counts a goal hit even after its due date", () => {
    const p = goalProgress(goal({ dueAt: daysAgo(1) }), series(30, 10_500, 10), NOW);
    expect(p.hit).toBe(true);
    expect(p.onTrack).toBe(true);
  });

  it("reports days remaining", () => {
    expect(goalProgress(goal({ dueAt: daysAhead(14) }), series(30, 9_500, 0), NOW).daysRemaining).toBe(14);
  });

  it("never reports negative days remaining", () => {
    expect(goalProgress(goal({ dueAt: daysAgo(10) }), series(30, 9_500, 0), NOW).daysRemaining).toBe(0);
  });
});

describe("goalProgress projection", () => {
  it("projects an arrival date for a steadily growing account", () => {
    const p = goalProgress(goal({ target: 9_800 }), series(40, 9_500, 20), NOW);
    expect(p.projectedHitAt).toBeInstanceOf(Date);
    expect(p.projectedHitAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("projects nothing when the trend will not get there", () => {
    const p = goalProgress(goal({ target: 5_000_000 }), series(40, 9_500, 20), NOW);
    expect(p.projectedHitAt).toBeNull();
  });

  it("projects nothing without enough history to forecast", () => {
    expect(goalProgress(goal(), series(3, 9_500, 20), NOW).projectedHitAt).toBeNull();
  });

  it("reports the hit immediately once the target is reached", () => {
    expect(goalProgress(goal(), series(30, 10_000, 5), NOW).projectedHitAt).toEqual(NOW);
  });
});

describe("newlyHitGoals / newlyMissedGoals", () => {
  const active = goal({ id: "g_active" });
  const archived = goal({ id: "g_archived", status: "archived" });

  it("finds active goals that have been hit", () => {
    const progress = [
      goalProgress(active, series(30, 10_000, 5), NOW),
      goalProgress(archived, series(30, 10_000, 5), NOW),
    ];
    const hits = newlyHitGoals(progress, [active, archived]);
    expect(hits.map((h) => h.goal.id)).toEqual(["g_active"]); // archived excluded
  });

  it("finds active goals now overdue and unmet", () => {
    const overdue = goal({ id: "g_overdue", dueAt: daysAgo(1) });
    const progress = [goalProgress(overdue, series(30, 9_200, 1), NOW)];
    expect(newlyMissedGoals(progress, [overdue]).map((m) => m.goal.id)).toEqual(["g_overdue"]);
  });

  it("does not report an overdue goal that was hit as missed", () => {
    const overdueHit = goal({ id: "g_ok", dueAt: daysAgo(1) });
    const progress = [goalProgress(overdueHit, series(30, 10_500, 5), NOW)];
    expect(newlyMissedGoals(progress, [overdueHit])).toHaveLength(0);
    expect(newlyHitGoals(progress, [overdueHit])).toHaveLength(1);
  });

  it("returns nothing for goals still in flight", () => {
    const progress = [goalProgress(active, series(30, 9_500, 5), NOW)];
    expect(newlyHitGoals(progress, [active])).toHaveLength(0);
    expect(newlyMissedGoals(progress, [active])).toHaveLength(0);
  });
});
