import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { grantCreatorReward } from "@/lib/creator-program";

// POST /api/admin/creator-program/[affiliateId]/grant — give a creator partner
// who reached the goal their free year of Pro (lib/creator-program.ts).
export const POST = withAdmin<{ affiliateId: string }>(async (req, { admin, params }) => {
  const result = await grantCreatorReward(params.affiliateId, admin.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await auditAdminAction(admin.userId, "creator.reward_granted", params.affiliateId, {
    after: { plan: result.planName, endsAt: result.endsAt.toISOString() },
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true, planName: result.planName, endsAt: result.endsAt });
});
