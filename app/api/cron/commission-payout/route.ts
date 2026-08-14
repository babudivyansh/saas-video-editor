import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runCommissionPayoutSweep } from "@/lib/cron/commission-payout";

// Daily cron — notifies affiliates when their commission hold period (30 days)
// has ended and payout is now available.
//
//   GET /api/cron/commission-payout
//   Authorization: Bearer <CRON_SECRET>
//
// See lib/cron/commission-payout.ts for the sweep itself, also reachable via
// POST /api/admin/commissions/run-payout-sweep for an on-demand admin trigger.

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void import("@/lib/cron-tracking").then((m) => m.recordCronRun("commission-payout")).catch(() => {});

  const result = await runCommissionPayoutSweep();
  return NextResponse.json(result);
}
