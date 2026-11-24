import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { campaignPatchSchema } from "@/lib/campaigns/schemas";
import { utmSlug } from "@/lib/campaigns/content";
import { serializeCampaign } from "@/lib/campaigns/serialize";

// GET — one campaign, its recipient breakdown and recent problems.
export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const [byStatus, problems] = await Promise.all([
    prisma.emailCampaignRecipient.groupBy({ by: ["status"], where: { campaignId: campaign.id }, _count: { _all: true } }),
    prisma.emailCampaignRecipient.findMany({
      where: { campaignId: campaign.id, status: { in: ["failed", "skipped"] } },
      orderBy: { claimedAt: "desc" },
      take: 25,
      select: { status: true, detail: true, claimedAt: true, user: { select: { id: true, email: true } } },
    }),
  ]);

  return NextResponse.json({
    campaign: serializeCampaign(campaign),
    recipients: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    problems: problems.map((p) => ({
      status: p.status, detail: p.detail, at: p.claimedAt?.toISOString() ?? null, userId: p.user.id, email: p.user.email,
    })),
  });
});

// PATCH — edit a draft. A scheduled campaign must be unscheduled first, so
// what the cron sends is never changed underneath it.
export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const body = await parseBody(req, campaignPatchSchema);
  const existing = await prisma.emailCampaign.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "Only drafts can be edited. Unschedule it first." }, { status: 409 });
  }
  const campaign = await prisma.emailCampaign.update({
    where: { id: existing.id },
    data: { ...body, ...(body.name ? { utmCampaign: utmSlug(body.name) } : {}) },
  });
  await auditAdminAction(admin.userId, "campaign.updated", campaign.id, { after: { fields: Object.keys(body) }, ip: auditIp(req) });
  return NextResponse.json({ campaign: serializeCampaign(campaign) });
});

// DELETE — drafts, and cancelled campaigns that never sent anything. Anything
// that went out stays as the record of what was mailed.
export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const existing = await prisma.emailCampaign.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const deletable = existing.status === "draft" || (existing.status === "cancelled" && existing.sentCount === 0);
  if (!deletable) {
    return NextResponse.json({ error: "Only drafts, or cancelled campaigns that sent nothing, can be deleted." }, { status: 409 });
  }
  await prisma.emailCampaign.delete({ where: { id: existing.id } });
  await auditAdminAction(admin.userId, "campaign.deleted", existing.id, { before: { name: existing.name, status: existing.status }, ip: auditIp(req) });
  return NextResponse.json({ status: "deleted" });
});
