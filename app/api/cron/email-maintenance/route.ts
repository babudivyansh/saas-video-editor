import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { withCronTracking } from "@/lib/cron-tracking";
import { routerEnabled } from "@/lib/email/router/config";
import { runEmailMaintenance } from "@/lib/email/router/maintenance";

// Multi-provider email upkeep (lib/email/router/maintenance.ts): retries
// deferred mail, settles stalled sends, re-probes providers that are out,
// raises quota/traffic alerts, prunes old rows. Every 5 minutes:
//   */5 * * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://clipiro.com/api/cron/email-maintenance
// A no-op (but still a tracked success) while EMAIL_ROUTER_ENABLED is off.
async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!routerEnabled()) return NextResponse.json({ ok: true, skipped: "router disabled" });

  try {
    const result = await runEmailMaintenance();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    logger.error("email-maintenance", "run failed", e);
    return NextResponse.json({ error: "Maintenance failed" }, { status: 500 });
  }
}

export const GET = withCronTracking("email-maintenance", handleGET);
