import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { withCronTracking } from "@/lib/cron-tracking";
import { runCampaigns } from "@/lib/campaigns/sender";

// Every 2 minutes — starts due Admin → Campaigns sends and works through their
// recipients within the day's campaign budget (lib/campaigns/sender.ts).
//
//   GET /api/cron/email-campaigns
//   Authorization: Bearer <CRON_SECRET>
async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runCampaigns(new Date());
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}

export const GET = withCronTracking("email-campaigns", handleGET);
