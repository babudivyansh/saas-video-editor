import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { campaignActionSchema } from "@/lib/campaigns/schemas";
import { serializeCampaign } from "@/lib/campaigns/serialize";

// POST { action } — move a campaign through its lifecycle:
//   schedule    draft → scheduled (at scheduledAt; "now" is fine)
//   unschedule  scheduled → draft
//   pause       sending → paused
//   resume      paused → sending
//   cancel      scheduled | sending | paused → cancelled (unsent recipients are dropped)
// Each move is a conditional update on the current status, so two admins (or
// an admin and the cron) can't both win a transition.
const FROM: Record<string, string[]> = {
  schedule: ["draft"],
  unschedule: ["scheduled"],
  pause: ["sending"],
  resume: ["paused"],
  cancel: ["scheduled", "sending", "paused"],
};
const TO: Record<string, string> = {
  schedule: "scheduled", unschedule: "draft", pause: "paused", resume: "sending", cancel: "cancelled",
};

export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const body = await parseBody(req, campaignActionSchema);
  const existing = await prisma.emailCampaign.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  let scheduledAt: Date | undefined;
  if (body.action === "schedule") {
    scheduledAt = new Date(body.scheduledAt);
    if (scheduledAt.getTime() < Date.now() - 5 * 60_000) {
      return NextResponse.json({ error: "That time is in the past." }, { status: 400 });
    }
  }

  const moved = await prisma.emailCampaign.updateMany({
    where: { id: existing.id, status: { in: FROM[body.action] } },
    data: {
      status: TO[body.action],
      ...(body.action === "schedule" ? { scheduledAt } : {}),
      ...(body.action === "unschedule" ? { scheduledAt: null } : {}),
      ...(body.action === "cancel" ? { completedAt: new Date() } : {}),
    },
  });
  if (moved.count === 0) {
    return NextResponse.json({ error: `Can't ${body.action} a campaign that is ${existing.status}.` }, { status: 409 });
  }
  if (body.action === "cancel") {
    const dropped = await prisma.emailCampaignRecipient.updateMany({
      where: { campaignId: existing.id, status: "pending" },
      data: { status: "skipped", detail: "campaign cancelled" },
    });
    if (dropped.count) {
      await prisma.emailCampaign.update({ where: { id: existing.id }, data: { skippedCount: { increment: dropped.count } } });
    }
  }

  const campaign = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: existing.id } });
  await auditAdminAction(admin.userId, `campaign.${body.action}`, campaign.id, {
    before: { status: existing.status },
    after: { status: campaign.status, scheduledAt: campaign.scheduledAt },
    ip: auditIp(req),
  });
  return NextResponse.json({ campaign: serializeCampaign(campaign) });
});
