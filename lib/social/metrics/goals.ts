// Goal tracking. Pure.

import { daysBetween } from "./dates";
import { daysToTarget } from "./forecast";
import type { SeriesPoint } from "./series";

export interface Goal {
  id: string;
  metric: string;
  target: number;
  /** Value when the goal was created. Progress is measured from here, not zero. */
  baseline: number | null;
  startAt: Date;
  dueAt: Date;
  status: string;
}

export interface GoalProgress {
  goalId: string;
  /** 0–100, clamped. */
  pct: number | null;
  current: number | null;
  target: number;
  baseline: number | null;
  /** Whether the pace so far is enough to hit the target by dueAt. */
  onTrack: boolean | null;
  daysRemaining: number;
  /** Units per day still needed. Null when already hit or unknowable. */
  requiredDailyRate: number | null;
  /** Units per day achieved so far. */
  actualDailyRate: number | null;
  /** Forecast arrival date, or null when the trend does not reach the target. */
  projectedHitAt: Date | null;
  hit: boolean;
  overdue: boolean;
}

/**
 * Progress against a goal.
 *
 * Measured from the baseline captured at creation: a user who sets "reach 10k
 * followers" while at 9k is 0% done, not 90%. Without that the number is
 * meaningless for anyone who did not start from zero.
 */
export function goalProgress(goal: Goal, series: SeriesPoint[], now: Date): GoalProgress {
  const current = series.length > 0 ? series[series.length - 1].value : null;
  const baseline = goal.baseline;
  const daysRemaining = Math.max(0, Math.ceil((goal.dueAt.getTime() - now.getTime()) / 86_400_000));
  const overdue = now.getTime() > goal.dueAt.getTime();

  const base: GoalProgress = {
    goalId: goal.id,
    pct: null,
    current,
    target: goal.target,
    baseline,
    onTrack: null,
    daysRemaining,
    requiredDailyRate: null,
    actualDailyRate: null,
    projectedHitAt: null,
    hit: false,
    overdue,
  };

  if (current === null) return base;

  const hit = current >= goal.target;

  // Progress from baseline → target. When no baseline was captured, fall back to
  // absolute progress toward the target, which is the best available reading.
  let pct: number;
  if (baseline !== null && goal.target !== baseline) {
    pct = ((current - baseline) / (goal.target - baseline)) * 100;
  } else if (goal.target > 0) {
    pct = (current / goal.target) * 100;
  } else {
    pct = hit ? 100 : 0;
  }
  pct = Math.max(0, Math.min(100, pct));

  if (hit) {
    return { ...base, pct: 100, hit: true, onTrack: true, projectedHitAt: now };
  }

  const elapsedDays = daysBetween(goal.startAt, now);
  const actualDailyRate = baseline !== null ? (current - baseline) / elapsedDays : null;

  const remaining = goal.target - current;
  const requiredDailyRate = daysRemaining > 0 ? remaining / daysRemaining : null;

  // On track when the pace achieved so far would still get there in time. With
  // no days left and the target unmet, it cannot be.
  const onTrack =
    actualDailyRate === null || requiredDailyRate === null
      ? null
      : actualDailyRate >= requiredDailyRate;

  const days = daysToTarget(series, goal.target, Math.max(daysRemaining, 365));
  const projectedHitAt = days === null ? null : new Date(now.getTime() + days * 86_400_000);

  return {
    ...base,
    pct,
    hit: false,
    onTrack: daysRemaining === 0 ? false : onTrack,
    requiredDailyRate,
    actualDailyRate,
    projectedHitAt,
  };
}

/** Goals whose target has been reached — the nightly job flips these to "hit". */
export function newlyHitGoals(
  progress: GoalProgress[],
  goals: Goal[],
): Array<{ goal: Goal; progress: GoalProgress }> {
  const byId = new Map(goals.map((g) => [g.id, g]));
  return progress
    .filter((p) => p.hit)
    .map((p) => ({ goal: byId.get(p.goalId)!, progress: p }))
    .filter((x) => x.goal && x.goal.status === "active");
}

/** Active goals now past their due date without hitting — flipped to "missed". */
export function newlyMissedGoals(
  progress: GoalProgress[],
  goals: Goal[],
): Array<{ goal: Goal; progress: GoalProgress }> {
  const byId = new Map(goals.map((g) => [g.id, g]));
  return progress
    .filter((p) => !p.hit && p.overdue)
    .map((p) => ({ goal: byId.get(p.goalId)!, progress: p }))
    .filter((x) => x.goal && x.goal.status === "active");
}
