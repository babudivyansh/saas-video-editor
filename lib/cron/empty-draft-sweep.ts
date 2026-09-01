// Deletes empty draft projects — rows the app created on the user's behalf
// that never received any work.
//
// Two bugs manufactured these in bulk: opening /dashboard/editor POSTed a
// "Untitled project" draft on page load before the user touched anything, and
// a failed Auto Clip import left its already-created draft behind (so every
// retry added another identically-titled row). Both are fixed at the source,
// but the accumulated rows are still there — they count toward "Active
// projects" and fill the "Continue where you left off" rail with cards that
// permanently read "0 clips".
//
// Unlike the other sweeps in this directory this is deliberately NOT wired to
// a cron. It deletes user-owned rows, so it runs only when an admin asks for
// it (app/api/admin/ops/run-empty-draft-sweep), and defaults to a dry run.
//
// "Empty" is intentionally strict — see lib/project-activity.ts. A draft is
// only swept when it has no clips, no editor document, no uploaded or rendered
// video, and has not been touched for EMPTY_DRAFT_MIN_AGE_DAYS. Anything the
// pipeline has already claimed (analyzing / pending_review / rendering) is not
// a draft and is never considered.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { emptyDraftWhere } from "@/lib/project-activity";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";

/** Grace period so a draft someone is actively filling in is never swept. */
export const EMPTY_DRAFT_MIN_AGE_DAYS = 7;

export interface EmptyDraftSweepResult {
  ok: true;
  /** True when nothing was deleted and the counts are a preview. */
  dryRun: boolean;
  matched: number;
  deleted: number;
  /** Distinct users whose summary cache was dropped. */
  usersAffected: number;
  /** A small sample of what matched, for eyeballing before a real run. */
  sample: Array<{ id: string; title: string; productType: string; updatedAt: string }>;
  at: string;
}

export interface EmptyDraftSweepOptions {
  /** Defaults to true — a real deletion must be asked for explicitly. */
  dryRun?: boolean;
  /** Restrict to one user; omit to sweep everyone. */
  userId?: string;
  minAgeDays?: number;
}

export async function runEmptyDraftSweep(
  opts: EmptyDraftSweepOptions = {},
): Promise<EmptyDraftSweepResult> {
  const dryRun = opts.dryRun ?? true;
  const minAgeDays = opts.minAgeDays ?? EMPTY_DRAFT_MIN_AGE_DAYS;
  const cutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000);

  const where = {
    ...emptyDraftWhere(opts.userId),
    updatedAt: { lt: cutoff },
  };

  const matches = await prisma.project.findMany({
    where,
    select: { id: true, userId: true, title: true, productType: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  });

  const sample = matches.slice(0, 10).map(p => ({
    id: p.id,
    title: p.title,
    productType: p.productType,
    updatedAt: p.updatedAt.toISOString(),
  }));
  const userIds = [...new Set(matches.map(p => p.userId))];

  if (dryRun || matches.length === 0) {
    return {
      ok: true,
      dryRun,
      matched: matches.length,
      deleted: 0,
      usersAffected: dryRun ? userIds.length : 0,
      sample,
      at: new Date().toISOString(),
    };
  }

  // Delete by the exact ids just matched rather than re-running the filter, so
  // a project that gained work between the read and the write is not caught by
  // a second evaluation of the predicate.
  const { count } = await prisma.project.deleteMany({ where: { id: { in: matches.map(p => p.id) } } });

  for (const userId of userIds) await invalidateDashboardSummary(userId);

  logger.info("empty-draft-sweep", "deleted empty drafts", {
    deleted: count,
    usersAffected: userIds.length,
    minAgeDays,
  });

  return {
    ok: true,
    dryRun: false,
    matched: matches.length,
    deleted: count,
    usersAffected: userIds.length,
    sample,
    at: new Date().toISOString(),
  };
}
