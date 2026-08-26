import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditIp } from "@/lib/admin/audit";
import { refundSchema } from "@/lib/admin/schemas";
import { refundPurchase } from "@/lib/admin/billing";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/admin/purchases/[id]/refund  body: { reason, clawbackCredits? }
// Record-keeping refund: marks the purchase refunded + claws back granted
// credits (floored at the user's balance). The money itself is refunded in
// the Razorpay dashboard — its webhook would mark the purchase too, so
// whichever happens first wins and the other 409s (idempotent).
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { allowed } = await rateLimit(`admin-refund:${admin.userId}`, 10, 900);
  if (!allowed) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  const { reason, clawbackCredits } = await parseBody(req, refundSchema);
  const result = await refundPurchase({
    purchaseId: params.id,
    actorId: admin.userId,
    reason,
    clawbackCredits,
    ip: auditIp(req),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, creditsClawedBack: result.creditsClawedBack });
});
