import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { userPatchSchema } from "@/lib/admin/schemas";
import { grantCredits, getBalances, setSubscriptionCredits, type CreditBucket } from "@/lib/credits";
import { cancelExistingSubscriptionForSwitch } from "@/lib/billing/subscription-switch";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  const body = await parseBody(req, userPatchSchema);
  const data: Record<string, unknown> = {};

  if ("monthlyCredits" in body) data.monthlyCredits = body.monthlyCredits;
  if ("role" in body) data.role = body.role;

  // Balance changes never go into `data`. User.credits is a DENORMALIZED total
  // of the three bucket columns, and lib/credits.ts's spendCredits recomputes
  // it from those buckets on every spend. Writing `credits` here left the
  // buckets untouched, so an admin-granted balance showed up in /api/auth/me
  // and the billing UI but could never actually be spent — and the first spend
  // that did succeed silently reset the total back to the bucket sum. It also
  // wrote no CreditTransaction row, so the grant was invisible to the ledger,
  // to refunds (restoreSpend is ledger-driven) and to the credit history UI.
  // Everything below is staged and applied through lib/credits instead.
  let grant: { bucket: CreditBucket; amount: number; reason: string } | null = null;
  let clearSubscriptionBucket = false;
  let cancelSubscriptionId: string | null = null;

  // Plan assignment: auto-apply the plan's full benefits so the admin doesn't
  // have to manually fill credits / subscriptionEndsAt / monthlyCredits.
  if ("planId" in body) {
    const planId: string | null = body.planId || null;

    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

      if (plan.kind === "subscription") {
        data.planId = planId;

        const months = plan.intervalMonths ?? 1;
        const monthlyCredits = plan.monthlyCredits ?? plan.credits;
        const now = new Date();
        const endsAt = new Date(now);
        endsAt.setMonth(endsAt.getMonth() + months);
        const nextRefill = new Date(now);
        nextRefill.setMonth(nextRefill.getMonth() + 1);

        // Apply subscription state — respect explicit overrides from the same request
        if (!("subscriptionEndsAt" in body)) data.subscriptionEndsAt = endsAt;
        if (!("monthlyCredits" in body)) data.monthlyCredits = monthlyCredits;
        data.subscriptionId = null;
        data.nextRefillAt = months > 1 ? nextRefill : null;
        // An active plan takes the account out of the free-tier monthly drip.
        data.freeCreditsRefillAt = null;

        // First month's credits, into the same bucket a real purchase grants
        // (lib/fulfillment.ts) so rollover, lapse-zeroing and refunds all treat
        // an admin-granted plan exactly like a bought one.
        grant = { bucket: "subscription", amount: monthlyCredits, reason: "grant:admin-plan-assign" };
      } else {
        // A pack/addon is a credit grant, not an entitlement, so it deliberately
        // does NOT set planId. A pack row carries no tier — getUserTier would
        // still resolve "free" — while a non-null planId permanently excludes
        // the account from the free-tier monthly drip (refill cron step 4),
        // which silently cost the user their 10 credits a month, forever.
        grant = { bucket: "purchased", amount: plan.credits, reason: "grant:admin-pack-assign" };
      }
    } else {
      // Clearing the plan: wipe all subscription state.
      const current = await prisma.user.findUnique({
        where: { id },
        select: { razorpaySubscriptionId: true },
      });
      if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });

      // The mandate has to die with the entitlement. Dropping the plan while
      // leaving razorpaySubscriptionId live meant Razorpay kept charging a
      // customer we had just moved to the free tier — and each of those charges
      // still resolved to this user in fulfillSubscriptionCharge, which then
      // granted 0 credits (the plan was gone) while re-extending their term.
      cancelSubscriptionId = current.razorpaySubscriptionId;

      data.planId = null;
      if (!("subscriptionEndsAt" in body)) data.subscriptionEndsAt = null;
      if (!("monthlyCredits" in body)) data.monthlyCredits = 0;
      data.subscriptionId = null;
      data.razorpaySubscriptionId = null;
      data.nextRefillAt = null;
      data.subscriptionCancelledAt = null;
      // Rejoin the free-tier drip from the next cycle, matching what the
      // refill cron does when a subscription lapses on its own.
      data.freeCreditsRefillAt = new Date(new Date().setMonth(new Date().getMonth() + 1));
      // Subscription credits end with the subscription; purchased and bonus
      // credits survive — again matching the cron's lapse step.
      clearSubscriptionBucket = true;
    }
  }

  if ("subscriptionEndsAt" in body) {
    data.subscriptionEndsAt = body.subscriptionEndsAt ?? null;
  }
  if ("name" in body) {
    const name = (body.name ?? "").trim();
    data.name = name || null;
  }
  if (body.email !== undefined) {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Email already in use by another account" }, { status: 409 });
    }
    data.email = body.email;
  }

  // Granting or revoking a plan moves a real entitlement (and real credits), so
  // it gets the same throttle as the audited credit-adjust endpoint.
  if ("planId" in body) {
    const { allowed } = await rateLimit(`admin-plan-assign:${admin.userId}`, 20, 900);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });
    }
  }

  // Cancel at Razorpay BEFORE touching the DB: if the provider call fails we
  // want the local link left intact so the next attempt can retry, rather than
  // an orphaned mandate charging a free-tier account with nothing pointing at it.
  if (cancelSubscriptionId) {
    // cancelExistingSubscriptionForSwitch logs the underlying Razorpay error
    // itself, so this branch only has to turn it into a response.
    const result = await cancelExistingSubscriptionForSwitch(id, cancelSubscriptionId);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Couldn't cancel this user's subscription with the payment provider — their plan was left unchanged. Please try again." },
        { status: 502 },
      );
    }
  }

  const before = await prisma.user.findUnique({
    where: { id },
    select: {
      credits: true, subscriptionCredits: true, purchasedCredits: true, bonusCredits: true,
      role: true, planId: true, subscriptionEndsAt: true, monthlyCredits: true,
      razorpaySubscriptionId: true,
    },
  });

  // Row update and balance change commit together: a plan grant that half-lands
  // (entitlement without credits, or credits without the entitlement) is worse
  // than one that fails outright and can be retried.
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, name: true, credits: true, monthlyCredits: true,
        role: true, subscriptionEndsAt: true, nextRefillAt: true,
        plan: { select: { id: true, name: true, slug: true } },
      },
    });
    if (clearSubscriptionBucket) {
      await setSubscriptionCredits(id, 0, "lapse:admin-plan-removed", tx);
    }
    if (grant) {
      await grantCredits({ userId: id, bucket: grant.bucket, amount: grant.amount, reason: grant.reason, tx });
    }
    return updated;
  });

  // Post-commit: both helpers skip their own cache refresh when handed a tx
  // (the caller owns it after commit), so re-sync the cached total from the
  // authoritative bucket sum rather than from the pre-grant `updated` row.
  const balances = await getBalances(id);
  await redis.set(`credits:${id}`, String(balances.total), "EX", 3600);

  await auditAdminAction(admin.userId, "user.updated", id, {
    before,
    after: {
      ...data,
      ...(grant ? { creditsGranted: grant.amount, creditsBucket: grant.bucket } : {}),
      ...(clearSubscriptionBucket ? { subscriptionCreditsCleared: true } : {}),
      ...(cancelSubscriptionId ? { razorpaySubscriptionCancelled: cancelSubscriptionId } : {}),
      balanceAfter: balances.total,
    },
    ip: auditIp(req),
  });

  return NextResponse.json({ user: { ...user, credits: balances.total } });
});

export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  if (id === admin.userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // The harder-to-reverse action (delete) had a weaker guard than the
  // reversible one (moderate/suspend, which already refuses an ADMIN target)
  // — bring delete in line with that.
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "Demote the admin role before deleting this account." }, { status: 409 });
  }

  const { allowed } = await rateLimit(`admin-user-delete:${admin.userId}`, 10, 900);
  if (!allowed) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  // Purchase rows are financial/audit records and can't cascade away with the
  // account (Purchase.user is onDelete: Restrict) — refuse up front with a
  // clear message instead of letting the delete below throw.
  const purchaseCount = await prisma.purchase.count({ where: { userId: id } });
  if (purchaseCount > 0) {
    return NextResponse.json(
      { error: "This user has billing history that must be retained for financial records, so the account can't be deleted." },
      { status: 409 },
    );
  }

  // Affiliate/Referral/Commission rows have no onDelete: Cascade, so they must
  // be cleared before the User row can be deleted, or Postgres throws a
  // foreign-key violation (this previously crashed with an unhandled 500 for
  // any affiliate-linked or referred user — see DELETE /api/auth/profile for
  // the same pattern used for self-service deletion).
  try {
    await prisma.$transaction([
      prisma.commission.deleteMany({ where: { referral: { referredUserId: id } } }),
      prisma.referral.deleteMany({ where: { referredUserId: id } }),
      prisma.commission.deleteMany({ where: { affiliate: { userId: id } } }),
      prisma.referral.deleteMany({ where: { affiliate: { userId: id } } }),
      prisma.affiliate.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
  } catch (err) {
    logger.error("admin.deleteUser", "request failed", err);
    return NextResponse.json({ error: "Could not delete this user — they may have related records that couldn't be cleared." }, { status: 409 });
  }

  // Clean up Redis session and credit cache
  await Promise.allSettled([
    redis.del(`session:${id}`),
    redis.del(`credits:${id}`),
  ]);

  await auditAdminAction(admin.userId, "user.deleted", id, { before: target, ip: auditIp(req) });

  return NextResponse.json({ success: true });
});
