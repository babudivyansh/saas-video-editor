// Goal progress across the top of the dashboard.
//
// Progress is measured from the baseline captured when the goal was set, which
// is why a bar can sit at 0% while the follower count is already high — the
// number that matters is movement since the commitment, not distance from zero.

import Link from "next/link";
import type { GoalProgress } from "@/lib/social/metrics";
import { fmtCompact } from "@/app/components/charts/format";

export interface GoalsStripProps {
  goals: Array<GoalProgress & { metric: string; label: string; measurable: boolean }>;
  href?: string;
}

export function GoalsStrip({ goals, href = "/dashboard/social-tracker/settings" }: GoalsStripProps) {
  if (goals.length === 0) return null;

  return (
    <section aria-labelledby="goals-heading">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="goals-heading" className="text-sm font-semibold text-ink">
          Goals
        </h2>
        <Link href={href} className="text-xs font-semibold text-brand hover:underline">
          Manage
        </Link>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => (
          <li
            key={goal.goalId}
            className="rounded-[var(--radius-card)] border border-card-border bg-panel p-3.5 shadow-card"
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-semibold text-ink">{goal.label}</span>
              <StatusChip goal={goal} />
            </div>

            {goal.measurable ? (
              <>
                <p className="mb-2 text-sm text-ink-soft">
                  <span className="font-bold text-ink">{fmtCompact(goal.current)}</span> of{" "}
                  {fmtCompact(goal.target)}
                  {goal.pct !== null && <span className="ml-1.5 tabular-nums">({goal.pct.toFixed(0)}%)</span>}
                </p>
                <div
                  role="progressbar"
                  aria-valuenow={goal.pct ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${goal.label} progress`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
                >
                  <div
                    className={`h-full rounded-full ${goal.hit ? "bg-emerald-500" : goal.onTrack === false ? "bg-amber-500" : "bg-brand"}`}
                    style={{ width: `${Math.min(100, Math.max(0, goal.pct ?? 0))}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  {goal.hit
                    ? "Reached"
                    : goal.overdue
                      ? "Past its due date"
                      : `${goal.daysRemaining} ${goal.daysRemaining === 1 ? "day" : "days"} left`}
                  {!goal.hit && goal.projectedHitAt && (
                    <> · on this pace, around {goal.projectedHitAt.toISOString().slice(0, 10)}</>
                  )}
                </p>
              </>
            ) : (
              // Not a 0% bar: this metric cannot be measured for these
              // accounts, and a bar at zero would read as "no progress".
              <p className="text-xs text-ink-soft">
                This platform does not report {goal.metric}, so progress cannot be measured.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusChip({ goal }: { goal: GoalProgress & { measurable: boolean } }) {
  if (!goal.measurable) {
    return <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-ink-soft">NO DATA</span>;
  }
  if (goal.hit) {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">HIT</span>;
  }
  if (goal.overdue) {
    return <span className="rounded-full bg-error/15 px-2 py-0.5 text-[10px] font-bold text-error">MISSED</span>;
  }
  if (goal.onTrack === null) {
    return <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-ink-soft">PACE UNKNOWN</span>;
  }
  return goal.onTrack ? (
    <span className="rounded-full bg-tint-blue px-2 py-0.5 text-[10px] font-bold text-brand">ON TRACK</span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">BEHIND</span>
  );
}
