import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { campaignAudienceSchema, countAudience } from "@/lib/campaigns/audience";

// POST { ...audience } — how many people it reaches right now (eligibility
// rules included). The real list is fixed when sending starts.
export const POST = withAdmin(async (req) => {
  const audience = await parseBody(req, campaignAudienceSchema);
  return NextResponse.json({ count: await countAudience(audience) });
});
