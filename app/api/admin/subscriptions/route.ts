import { NextResponse } from "next/server";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { subscriptionsQuerySchema } from "@/lib/admin/schemas";
import { countActiveStatuses, listSubscribers, listTrialsFiltered } from "@/lib/admin/subscriptions-admin";

// GET /api/admin/subscriptions?view=subscribers|trials&status&outcome&search&page&limit
//
//   subscribers  accounts with a plan or trial running now, each with its
//                billing status (paying / cancelled renewal / payment failed /
//                in trial / trial cancelled). ?status= narrows to one.
//   trials       every trial ever started and what became of it (converted,
//                cancelled in app, mandate revoked at the bank / UPI app, first
//                charge failed, …). ?outcome= narrows to one.
//
// Both views also return the headline counts. Trials used to be counted as
// "Active Subscribers" here, because a trial sets subscriptionEndsAt too.
export const GET = withAdmin(async (req) => {
  const q = parseQuery(req, subscriptionsQuerySchema);
  const now = new Date();

  const [statusCounts, trials] = await Promise.all([
    countActiveStatuses(now),
    listTrialsFiltered({ outcome: q.view === "trials" ? q.outcome : undefined, search: q.view === "trials" ? q.search : undefined, page: q.page, limit: q.limit, now }),
  ]);

  if (q.view === "trials") {
    return NextResponse.json({
      view: "trials",
      rows: trials.rows,
      total: trials.total,
      page: q.page,
      limit: q.limit,
      statusCounts,
      trialSummary: trials.summary,
      trialWeeks: trials.weeks,
    });
  }

  const subscribers = await listSubscribers({ status: q.status, search: q.search, page: q.page, limit: q.limit, now });
  return NextResponse.json({
    view: "subscribers",
    rows: subscribers.rows,
    total: subscribers.total,
    page: q.page,
    limit: q.limit,
    statusCounts,
    trialSummary: trials.summary,
  });
});
