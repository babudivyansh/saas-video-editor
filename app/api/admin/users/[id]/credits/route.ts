import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditIp } from "@/lib/admin/audit";
import { creditAdjustSchema } from "@/lib/admin/schemas";
import { adjustCredits } from "@/lib/admin/billing";

// POST /api/admin/users/[id]/credits  body: { delta, reason }
// The audited way to correct a balance (vs. silently overwriting the credits
// field): grants and deductions both require a reason and land in AuditLog.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { delta, reason } = await parseBody(req, creditAdjustSchema);
  const result = await adjustCredits({
    userId: params.id,
    delta,
    actorId: admin.userId,
    reason,
    ip: auditIp(req),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, balance: result.balance });
});
