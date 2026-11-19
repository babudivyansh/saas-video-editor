import { NextResponse } from "next/server";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { emailOverviewQuerySchema } from "@/lib/admin/schemas";
import {
  getEmailOverview, getEmailSettings, getProviderCards, listOpenAlerts, resolveRange,
} from "@/lib/email/router/admin-queries";

// One snapshot for Admin → Email: KPIs + charts for the range, the provider
// cards (always "now"), settings, and open alerts.
export const GET = withAdmin(async (req) => {
  const q = parseQuery(req, emailOverviewQuerySchema);
  const range = resolveRange(q.range, q.from, q.to);
  const [overview, providers, settings, alerts] = await Promise.all([
    getEmailOverview(range), getProviderCards(), getEmailSettings(), listOpenAlerts(),
  ]);
  return NextResponse.json({ ...overview, providers, settings, alerts });
});
