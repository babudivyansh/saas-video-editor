import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { campaignPreviewSchema } from "@/lib/campaigns/schemas";
import { campaign } from "@/lib/email/templates/campaign";
import { renderEmail } from "@/lib/email/layout";
import { APP_URL } from "@/lib/email/tokens";

// POST { subject, preheader, blocks } — the email as a recipient would see it,
// for the editor's live preview. Renders only; sends nothing.
export const POST = withAdmin(async (req) => {
  const body = await parseBody(req, campaignPreviewSchema);
  const doc = campaign({ ...body, name: "Alex", utmCampaign: "preview" });
  const rendered = renderEmail({
    ...doc,
    accent: "brand",
    // A stand-in, so the footer shows what recipients get.
    unsubscribeUrl: `${APP_URL}/dashboard/settings/notifications`,
  });
  return NextResponse.json({ subject: rendered.subject, html: rendered.html, text: rendered.text });
});
