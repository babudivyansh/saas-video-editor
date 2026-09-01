import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { planSyncSchema } from "@/lib/admin/schemas";
import { syncRazorpayPlan, SYNC_CURRENCIES } from "@/lib/billing/razorpay-plans";

// POST /api/admin/plans/[id]/sync-razorpay  body: { currencies?, force? }
//
// Provisions the Razorpay Plan(s) a subscription row needs for the recurring
// Subscriptions flow. Until a plan has one for the requested currency, checkout
// silently falls back to a one-time order: no auto-renewal, and a requested
// 7-day trial is dropped after the UI has already promised it. This used to be
// reachable only by running scripts/razorpay-sync-plans.ts on a shell, so a
// plan created through /admin/pricing could never be put on recurring billing
// from the admin panel at all.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const body = await parseBody(req, planSyncSchema);
  const currencies = body.currencies ?? SYNC_CURRENCIES;

  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (plan.kind !== "subscription") {
    return NextResponse.json(
      { error: "Only subscription plans use Razorpay Plans — packs are one-time orders." },
      { status: 400 },
    );
  }

  const results = [];
  for (const currency of currencies) {
    // Re-read between currencies so the second call sees the id the first stored.
    const fresh = await prisma.plan.findUnique({ where: { id: params.id } });
    results.push(await syncRazorpayPlan(fresh!, currency, { force: body.force ?? false }));
  }

  const failed = results.filter((r) => !r.ok);
  await auditAdminAction(admin.userId, "plan.razorpay_synced", params.id, {
    after: { results, force: body.force ?? false },
    ip: auditIp(req),
  });

  // Partial success is real (INR can succeed while USD fails), so report every
  // outcome rather than collapsing to a single status.
  return NextResponse.json({ results }, { status: failed.length === results.length ? 502 : 200 });
});
