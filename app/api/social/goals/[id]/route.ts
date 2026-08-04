import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotFoundError, assertOwnedAccount, ok, parseBody, withSocial } from "@/lib/social/api";
import { goalUpdateSchema } from "@/lib/social/schemas";
import { loadAccounts } from "@/lib/social/queries";
import { goalProgress, rangeBounds } from "@/lib/social/metrics";
import { seriesForGoal, toGoal } from "../route";

// GET    /api/social/goals/[id] → one goal with its progress
// PATCH  /api/social/goals/[id] → edit target, due date, scope or status
// DELETE /api/social/goals/[id] → remove it
const PROGRESS_WINDOW_DAYS = 90;

type Params = { id: string };

/** Ownership by userId, not by id alone — same rule as assertOwnedAccount. */
async function ownedGoal(userId: string, id: string) {
  const goal = await prisma.socialGoal.findFirst({ where: { id, userId } });
  if (!goal) throw new NotFoundError("Goal not found");
  return goal;
}

export const GET = withSocial<Params>(async (_req, { auth, params }) => {
  const goal = await ownedGoal(auth.userId, params.id);
  const now = new Date();
  const { from, to } = rangeBounds(PROGRESS_WINDOW_DAYS, now);
  const accounts = await loadAccounts(auth.userId);
  const series = await seriesForGoal(goal, accounts, from, to);

  return ok({ goal, progress: goalProgress(toGoal(goal), series, now), measurable: series.length > 0 });
});

export const PATCH = withSocial<Params>(async (req: NextRequest, { auth, params }) => {
  await ownedGoal(auth.userId, params.id);
  const body = await parseBody(req, goalUpdateSchema);
  if (body.accountId) await assertOwnedAccount(auth.userId, body.accountId);

  // The baseline is deliberately NOT recomputed on edit. Someone raising their
  // target mid-quarter is changing the finish line, not the starting line, and
  // rebasing would erase the progress they have already made.
  const goal = await prisma.socialGoal.update({
    where: { id: params.id },
    data: {
      ...(body.metric !== undefined ? { metric: body.metric } : {}),
      ...(body.target !== undefined ? { target: body.target } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt } : {}),
      ...(body.accountId !== undefined ? { accountId: body.accountId ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
  });

  return ok({ goal });
}, {
  rateLimit: { key: (auth) => `social:goals:write:${auth.userId}`, max: 30, windowSec: 3600 },
});

// Not subscriber-gated: someone whose plan lapsed must still be able to delete
// their own data. Same rule as the account disconnect route.
export const DELETE = withSocial<Params>(async (_req, { auth, params }) => {
  await ownedGoal(auth.userId, params.id);
  await prisma.socialGoal.delete({ where: { id: params.id } });
  return ok({ deleted: true });
}, { subscriber: false });
