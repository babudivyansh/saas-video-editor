import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { planPatchSchema } from "@/lib/admin/schemas";
import { resyncPricedCurrencies, storedPlanId, SYNC_CURRENCIES } from "@/lib/billing/razorpay-plans";

export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const data = await parseBody(req, planPatchSchema);

  const before = await prisma.plan.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // A price change on a plan that is already live on Razorpay has to re-mint the
  // Razorpay Plan, because Razorpay Plans are immutable. Without this, /pricing
  // advertised the new price while checkout kept creating subscriptions against
  // the old amount — an advertised-vs-charged divergence with no ceiling on how
  // long it could run unnoticed.
  //
  // The re-mint happens BEFORE the row is updated and the whole request fails if
  // Razorpay rejects it, so the stored price and the charged price can never
  // disagree. Existing subscribers are unaffected: Razorpay keeps billing them
  // against the old plan id, which is exactly the grandfathering we want.
  const priceChanged =
    data.priceInPaise !== undefined && data.priceInPaise !== before.priceInPaise;
  let resynced: string[] = [];

  if (priceChanged && before.kind === "subscription") {
    const outcomes = await resyncPricedCurrencies(
      { ...before, priceInPaise: data.priceInPaise! },
      before.priceInPaise,
    );
    const failed = outcomes.find((o) => !o.ok);
    if (failed && !failed.ok) {
      return NextResponse.json(
        {
          error: `${failed.error} The price was NOT changed — /pricing and Razorpay would otherwise disagree.`,
          currency: failed.currency,
        },
        { status: 502 },
      );
    }
    // Only currencies whose charged amount actually moved — a price-book-anchored
    // currency is reported back unchanged and must not read as a re-mint.
    resynced = outcomes.flatMap((o) => (o.ok && o.created ? [`${o.currency}:${o.razorpayPlanId}`] : []));
  }

  const plan = await prisma.plan.update({ where: { id }, data });

  await auditAdminAction(admin.userId, "plan.updated", id, {
    before,
    after: { ...data, ...(resynced.length ? { razorpayPlansReminted: resynced } : {}) },
    ip: auditIp(req),
  });

  return NextResponse.json({ plan, resynced });
});

// Soft-delete by deactivating so historical purchases keep their plan reference.
//
// Deliberately does NOT cancel anyone's live Razorpay subscription: deactivating
// stops the plan being OFFERED, it isn't a decision to terminate the customers
// already on it. Their mandates keep renewing until they cancel (or an admin
// clears their plan, which does cancel — see PATCH /api/admin/users/[id]).
export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  const plan = await prisma.plan.update({ where: { id }, data: { active: false } });

  // Surfaced so the confirm dialog can tell the truth about who keeps being
  // charged, instead of the flat "existing subscribers are unaffected".
  const activeSubscribers = await prisma.user.count({
    where: { planId: id, subscriptionEndsAt: { gt: new Date() } },
  });
  const recurringSubscribers = await prisma.user.count({
    where: { planId: id, subscriptionEndsAt: { gt: new Date() }, razorpaySubscriptionId: { not: null } },
  });

  await auditAdminAction(admin.userId, "plan.deactivated", id, {
    after: { active: false, activeSubscribers, recurringSubscribers },
    ip: auditIp(req),
  });

  return NextResponse.json({ plan, activeSubscribers, recurringSubscribers });
});

// Razorpay sync state for one plan, per currency. `unsynced` means checkout
// falls back to the legacy one-time order flow for that currency: the customer
// pays once and the term lapses instead of auto-renewing (and a requested trial
// is silently dropped), which is invisible in the UI without this.
export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  return NextResponse.json({
    sync: SYNC_CURRENCIES.map((currency) => ({
      currency,
      razorpayPlanId: storedPlanId(plan, currency),
      synced: storedPlanId(plan, currency) != null,
    })),
  });
});
