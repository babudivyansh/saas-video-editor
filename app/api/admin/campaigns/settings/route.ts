import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { campaignSettingsSchema } from "@/lib/campaigns/schemas";
import { campaignBudget, getDailyCap, setDailyCap } from "@/lib/campaigns/budget";

// PUT { dailyCap } — the most campaign emails sent per day (0 stops sending).
export const PUT = withAdmin(async (req, { admin }) => {
  const { dailyCap } = await parseBody(req, campaignSettingsSchema);
  const before = await getDailyCap();
  await setDailyCap(dailyCap);
  await auditAdminAction(admin.userId, "campaign.daily_cap_set", undefined, {
    before: { dailyCap: before },
    after: { dailyCap },
    ip: auditIp(req),
  });
  return NextResponse.json({ budget: await campaignBudget() });
});
