// Operational snapshot for premium caption renders (§33).
//
// Plugged into the EXISTING admin Ops page rather than given a dashboard of its
// own — an operator looking for "is anything wedged?" should find this next to
// the queue counts and cron statuses, not on a separate screen they have to
// know exists.
//
// Deliberately answers the three questions that cost money if unanswered:
//   • is anything STUCK (charged for, not delivered, nobody looking)?
//   • is anything in an UNKNOWN provider state (cannot retry, cannot refund)?
//   • what have we spent today, and did those renders succeed?

import { prisma } from "@/lib/prisma";
import { staleTimeoutMinutes } from "@/lib/cron/submagic-sweep";

export interface CaptionRenderOpsSnapshot {
  /** Rendered today, by our own status vocabulary. */
  today: { total: number; completed: number; failed: number; inFlight: number };
  successRatePct: number | null;
  /** Jobs past the stale timeout and still not terminal. These need a human. */
  stuck: number;
  /** Paid calls whose outcome we don't know. Blocks any further spend on them. */
  needsReconciliation: number;
  /** Median and p95 wall-clock, ms, for renders that completed today. */
  latencyMs: { p50: number | null; p95: number | null };
  /** Credits charged today. Provider $ is deliberately NOT surfaced per-user. */
  creditsToday: number;
  /** Most-used templates today, so a dead style is visible. */
  topTemplates: { templateId: string; count: number }[];
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export async function captionRenderOpsSnapshot(): Promise<CaptionRenderOpsSnapshot | null> {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const staleBefore = new Date(Date.now() - staleTimeoutMinutes() * 60_000);

    const [rows, stuck, needsReconciliation] = await Promise.all([
      prisma.captionRenderJob.findMany({
        where: { createdAt: { gte: since } },
        select: {
          status: true, templateId: true, actualCredits: true, estimatedCredits: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.captionRenderJob.count({
        where: {
          status: { notIn: ["completed", "failed", "cancelled", "ready_to_edit", "editing"] },
          updatedAt: { lt: staleBefore },
        },
      }),
      prisma.captionRenderJob.count({ where: { status: "needs_reconciliation" } }),
    ]);

    const completed = rows.filter((r) => r.status === "completed");
    const failed = rows.filter((r) => r.status === "failed");
    const inFlight = rows.length - completed.length - failed.length;

    const durations = completed
      .map((r) => r.updatedAt.getTime() - r.createdAt.getTime())
      .filter((ms) => ms > 0)
      .sort((a, b) => a - b);

    const templateCounts = new Map<string, number>();
    for (const r of rows) templateCounts.set(r.templateId, (templateCounts.get(r.templateId) ?? 0) + 1);

    const decided = completed.length + failed.length;

    return {
      today: { total: rows.length, completed: completed.length, failed: failed.length, inFlight },
      // Null rather than 100% when nothing has finished — a made-up success
      // rate on zero data is exactly the "zeros pretending to be data" the
      // metrics module's honesty rule forbids.
      successRatePct: decided > 0 ? Math.round((completed.length / decided) * 100) : null,
      stuck,
      needsReconciliation,
      latencyMs: { p50: percentile(durations, 50), p95: percentile(durations, 95) },
      creditsToday: rows.reduce((s, r) => s + (r.actualCredits ?? r.estimatedCredits ?? 0), 0),
      topTemplates: [...templateCounts.entries()]
        .map(([templateId, count]) => ({ templateId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  } catch {
    // The Ops page must render even if this one query fails.
    return null;
  }
}
