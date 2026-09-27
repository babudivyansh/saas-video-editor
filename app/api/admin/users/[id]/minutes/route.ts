import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditIp } from "@/lib/admin/audit";
import { creditAdjustSchema } from "@/lib/admin/schemas";
import { adjustMinutes } from "@/lib/admin/billing";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/admin/users/[id]/minutes  body: { delta, reason }
// The audited way to correct a Clip Minutes balance — the twin of ../credits,
// same body shape, same throttle, same AuditLog trail.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { allowed } = await rateLimit(`admin-minute-adjust:${admin.userId}`, 10, 900);
  if (!allowed) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  const { delta, reason } = await parseBody(req, creditAdjustSchema);
  const result = await adjustMinutes({
    userId: params.id,
    delta,
    actorId: admin.userId,
    reason,
    ip: auditIp(req),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, balance: result.balance });
});
