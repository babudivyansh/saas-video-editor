import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { sendTemplate } from "@/lib/email/send";
import { campaignBlocksSchema } from "@/lib/campaigns/content";
import { greetingName } from "@/lib/display-name";

// POST — send this campaign to the signed-in admin's own address, exactly as a
// recipient would get it (real providers, real unsubscribe link). Spends one
// email of quota; never touches the campaign's counts.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const blocks = campaignBlocksSchema.safeParse(campaign.blocks);
  if (!blocks.success) return NextResponse.json({ error: "This campaign's content is invalid." }, { status: 422 });

  const me = await prisma.user.findUnique({ where: { id: admin.userId }, select: { email: true, name: true } });
  if (!me) return NextResponse.json({ error: "Admin account not found" }, { status: 404 });

  const res = await sendTemplate(
    "campaign",
    me.email,
    {
      name: greetingName(me.name),
      subject: `[Test] ${campaign.subject}`,
      preheader: campaign.preheader,
      blocks: blocks.data,
      utmCampaign: campaign.utmCampaign,
    },
    { userId: admin.userId },
  );
  await auditAdminAction(admin.userId, "campaign.test_sent", campaign.id, { after: { status: res.status }, ip: auditIp(req) });

  const MESSAGES: Partial<Record<typeof res.status, string>> = {
    sent: `Sent to ${me.email}.`,
    deferred: "Queued: no provider could take it right now; it will retry.",
    "dev-logged": "No email provider is configured here, so it was only logged.",
    "skipped-optout": "Not sent: your own account has marketing emails switched off (Settings → Notifications).",
    suppressed: "Not sent: your address is on the suppression list.",
  };
  const ok = res.status === "sent" || res.status === "dev-logged" || res.status === "deferred";
  const message = MESSAGES[res.status] ?? `Not sent: ${res.error ?? res.status}`;
  return NextResponse.json({ ok, status: res.status, message }, { status: ok ? 200 : 502 });
});
