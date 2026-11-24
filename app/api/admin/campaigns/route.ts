import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { campaignCreateSchema } from "@/lib/campaigns/schemas";
import { utmSlug } from "@/lib/campaigns/content";
import { campaignBudget } from "@/lib/campaigns/budget";
import { serializeCampaign } from "@/lib/campaigns/serialize";

// Admin → Campaigns. GET lists campaigns with today's send budget; POST
// creates a draft. Scheduling and sending: [id]/action and
// app/api/cron/email-campaigns.
export const GET = withAdmin(async () => {
  const [campaigns, budget] = await Promise.all([
    prisma.emailCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    campaignBudget(),
  ]);
  return NextResponse.json({ campaigns: campaigns.map(serializeCampaign), budget });
});

export const POST = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, campaignCreateSchema);
  const campaign = await prisma.emailCampaign.create({
    data: {
      name: body.name,
      subject: body.subject,
      preheader: body.preheader,
      blocks: body.blocks,
      audience: body.audience,
      utmCampaign: utmSlug(body.name),
      createdByAdminId: admin.userId,
    },
  });
  await auditAdminAction(admin.userId, "campaign.created", campaign.id, { after: { name: campaign.name }, ip: auditIp(req) });
  return NextResponse.json({ campaign: serializeCampaign(campaign) }, { status: 201 });
});
