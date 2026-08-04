import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  HttpError, assertOwnedAccount, ok, parseBody, parseQuery, withSocial,
} from "@/lib/social/api";
import { goalSchema } from "@/lib/social/schemas";
import { loadAccounts, loadFollowerSeries, loadSeries } from "@/lib/social/queries";
import { goalProgress, rangeBounds, type Goal, type SeriesPoint } from "@/lib/social/metrics";
import type { MetricKey } from "@/lib/social/capabilities";
import { z } from "zod";

// GET  /api/social/goals?status=active → goals with computed progress
// POST /api/social/goals               → create one
//
// Progress is computed on read, never stored: a stored percentage is stale the
// moment the next sync lands, and there is no cheaper way to be wrong.
const MAX_GOALS = 20;
/** How much history the pace and projection are measured over. */
const PROGRESS_WINDOW_DAYS = 90;

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({
    status: z.enum(["active", "hit", "missed", "archived", "all"]).default("active"),
  }));

  const goals = await prisma.socialGoal.findMany({
    where: { userId: auth.userId, ...(q.status === "all" ? {} : { status: q.status }) },
    orderBy: { dueAt: "asc" },
  });

  const now = new Date();
  const { from, to } = rangeBounds(PROGRESS_WINDOW_DAYS, now);
  const accounts = await loadAccounts(auth.userId);

  const progress = await Promise.all(
    goals.map(async (goal) => {
      const series = await seriesForGoal(goal, accounts, from, to);
      return {
        goal,
        progress: goalProgress(toGoal(goal), series, now),
        // A goal on a metric this account cannot report is not "0% done" — it
        // is unmeasurable, and the UI has to say so rather than show a bar.
        measurable: series.length > 0,
      };
    }),
  );

  return ok({ goals: progress });
}, {
  rateLimit: { key: (auth) => `social:goals:${auth.userId}`, max: 60, windowSec: 60 },
});

export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, goalSchema);
  if (body.accountId) await assertOwnedAccount(auth.userId, body.accountId);

  const count = await prisma.socialGoal.count({ where: { userId: auth.userId, status: "active" } });
  if (count >= MAX_GOALS) {
    throw new HttpError(409, `You can track up to ${MAX_GOALS} active goals.`, "limit_reached");
  }

  // The baseline is captured NOW, at creation, and never recomputed. Measuring
  // from zero would tell someone who set "reach 10k followers" while sitting at
  // 9k that they are 90% done before doing anything.
  const accounts = await loadAccounts(auth.userId, body.accountId ? [body.accountId] : undefined);
  const { from, to } = rangeBounds(PROGRESS_WINDOW_DAYS, new Date());
  const series = await seriesForGoal(
    { accountId: body.accountId ?? null, metric: body.metric },
    accounts,
    from,
    to,
  );
  const baseline = series.length > 0 ? series[series.length - 1].value : null;

  const goal = await prisma.socialGoal.create({
    data: {
      userId: auth.userId,
      accountId: body.accountId ?? null,
      metric: body.metric,
      target: body.target,
      baseline,
      dueAt: body.dueAt,
    },
  });

  return ok({ goal }, { status: 201 });
}, {
  rateLimit: { key: (auth) => `social:goals:write:${auth.userId}`, max: 20, windowSec: 3600 },
});

/** Prisma row → the pure engine's Goal shape. */
export function toGoal(row: {
  id: string; metric: string; target: number; baseline: number | null;
  startAt: Date; dueAt: Date; status: string;
}): Goal {
  return {
    id: row.id,
    metric: row.metric,
    target: row.target,
    baseline: row.baseline,
    startAt: row.startAt,
    dueAt: row.dueAt,
    status: row.status,
  };
}

/**
 * The series a goal is measured against.
 *
 * An account-scoped goal reads that account; a portfolio goal sums across every
 * connected account, aligned by date — summing follower counts is meaningful,
 * and this is the one place the product treats "my audience" as one number.
 */
export async function seriesForGoal(
  goal: { accountId: string | null; metric: string },
  accounts: Awaited<ReturnType<typeof loadAccounts>>,
  from: Date,
  to: Date,
): Promise<SeriesPoint[]> {
  const scoped = goal.accountId ? accounts.filter((a) => a.id === goal.accountId) : accounts;
  if (scoped.length === 0) return [];

  const perAccount = await Promise.all(
    scoped.map(async (account) => {
      if (goal.metric === "followers") {
        return loadFollowerSeries(account.id, from, to, account.timezone ?? "UTC");
      }
      const result = await loadSeries(
        account,
        goal.metric as MetricKey,
        from,
        to,
        "day",
        account.timezone ?? "UTC",
      );
      return result.points;
    }),
  );

  if (perAccount.length === 1) return perAccount[0];

  const byDate = new Map<string, number>();
  for (const points of perAccount) {
    for (const p of points) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
