import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendAffiliateReferralSignupEmail, sendAdminAffiliatePayoutReadyEmail } from "@/lib/email";
import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";

export function generateAffiliateCode(name: string): string {
  const prefix = (name ?? "USR").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function createUniqueCode(name: string): Promise<string> {
  let code = generateAffiliateCode(name);
  let attempts = 0;
  while (attempts < 10) {
    const existing = await prisma.affiliate.findUnique({ where: { code } });
    if (!existing) return code;
    code = generateAffiliateCode(name);
    attempts++;
  }
  // Fallback: pure random
  return "REF-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export type ReferralRejectReason = "invalid" | "expired" | "self" | "duplicate";
export type ReferralResolution =
  | {
      applied: true;
      code: string;
      affiliateId: string;
      affiliateUser: { userId: string; email: string; firstName: string | null; name: string | null };
    }
  | { applied: false; reason: ReferralRejectReason };

interface ResolveReferralInput {
  cookieCode?: string | null;
  typedCode?: string | null;
  email: string;
  phone?: string | null;
}

/**
 * Pure resolution (one read, no writes) — shared by the live validate-code
 * endpoint (dry run) and attributeReferral (which also writes). Precedence
 * when both a cookie (link click) and a typed code are present: the cookie
 * wins if they differ ("duplicate" — proxy.ts's cookie is already
 * first-click-wins; the manual field only fills the gap when no cookie
 * exists). Identical codes are a no-op match.
 */
export async function resolveReferralCode(input: ResolveReferralInput): Promise<ReferralResolution | null> {
  const { cookieCode, typedCode, email, phone } = input;
  if (!cookieCode && !typedCode) return null;

  if (cookieCode && typedCode && cookieCode.toUpperCase() !== typedCode.toUpperCase()) {
    return { applied: false, reason: "duplicate" };
  }

  const code = (typedCode || cookieCode)!.trim().toUpperCase();
  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
    include: { user: { select: { id: true, email: true, phone: true, firstName: true, name: true } } },
  });

  if (!affiliate || affiliate.status !== "active") return { applied: false, reason: "invalid" };
  if (affiliate.codeExpiresAt && affiliate.codeExpiresAt < new Date()) {
    return { applied: false, reason: "expired" };
  }

  const emailMatch = affiliate.user.email === email.toLowerCase();
  const phoneMatch = !!phone && !!affiliate.user.phone && affiliate.user.phone === phone;
  if (emailMatch || phoneMatch) return { applied: false, reason: "self" };

  return {
    applied: true,
    code,
    affiliateId: affiliate.id,
    affiliateUser: {
      userId: affiliate.user.id,
      email: affiliate.user.email,
      firstName: affiliate.user.firstName,
      name: affiliate.user.name,
    },
  };
}

interface AttributeReferralInput extends ResolveReferralInput {
  newUser: { id: string; firstName: string | null; name: string | null };
  signupIp: string | null;
}

/**
 * Called once, post-user-creation, from BOTH app/api/auth/register/route.ts
 * and app/api/auth/callback/google/route.ts. Non-fatal by design: any
 * internal failure is caught and logged, never thrown — a referral-
 * attribution bug must never block account creation.
 */
export async function attributeReferral(input: AttributeReferralInput): Promise<ReferralResolution | null> {
  try {
    const resolved = await resolveReferralCode(input);
    if (!resolved || !resolved.applied) return resolved;

    // Soft fraud signal (unchanged behavior): same /24 subnet as this
    // affiliate's most recent prior signup creates the referral as "flagged"
    // instead of "signed_up" and suppresses the notification email below.
    const priorIp = await prisma.referral
      .findFirst({ where: { affiliateId: resolved.affiliateId }, orderBy: { signedUpAt: "desc" } })
      .then((r) => r?.signupIp ?? null);
    const sameSubnet =
      !!input.signupIp &&
      !!priorIp &&
      input.signupIp.split(".").slice(0, 3).join(".") === priorIp.split(".").slice(0, 3).join(".");

    await prisma.referral.create({
      data: {
        affiliateId: resolved.affiliateId,
        referredUserId: input.newUser.id,
        status: sameSubnet ? "flagged" : "signed_up",
        signupIp: input.signupIp,
      },
    });
    await prisma.user.update({ where: { id: input.newUser.id }, data: { referredBy: resolved.affiliateId } });

    if (!sameSubnet) {
      const totalReferrals = await prisma.referral.count({ where: { affiliateId: resolved.affiliateId } });
      sendAffiliateReferralSignupEmail(
        resolved.affiliateUser.email,
        resolved.affiliateUser.firstName ?? resolved.affiliateUser.name ?? "",
        input.newUser.firstName ?? input.newUser.name ?? "A new user",
        totalReferrals,
      ).catch((e) => logger.error("affiliate", "referral signup email error", e));
    }
    return resolved;
  } catch (err) {
    logger.error("affiliate", "attributeReferral failed", err);
    return null;
  }
}

/**
 * Best-effort admin alert when an affiliate's "available" balance is at or
 * above the payout threshold. Called from every place a Commission can
 * transition to "available" (the cron/manual sweep, admin release), plus the
 * affiliate's own payout-request route as a defensive catch-all. Idempotent
 * via payoutThresholdNotifiedAt: re-reads it fresh on every call, so calling
 * this redundantly for the same affiliate multiple times (e.g. several
 * commissions flipping in one sweep run) is cheap and safe — no separate
 * batching/dedup pass is needed by callers. Never throws.
 */
export async function notifyAdminsIfPayoutEligible(
  affiliateId: string,
  trigger: "threshold" | "requested" = "threshold",
): Promise<void> {
  try {
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: { user: { select: { email: true, firstName: true, name: true } } },
    });
    if (!affiliate || affiliate.payoutThresholdNotifiedAt) return;

    const { _sum } = await prisma.commission.aggregate({
      where: { affiliateId, status: "available" },
      _sum: { amount: true },
    });
    const available = _sum.amount ?? 0;
    if (available < MIN_PAYOUT_AMOUNT) return;

    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
    let sent = 0;
    for (const admin of admins) {
      try {
        await sendAdminAffiliatePayoutReadyEmail(admin.email, {
          affiliateName: affiliate.user.firstName ?? affiliate.user.name ?? "",
          affiliateEmail: affiliate.user.email,
          affiliateCode: affiliate.code,
          availableAmount: available,
          trigger,
        });
        sent++;
      } catch (e) {
        logger.error("affiliate", `payout-ready email failed for admin ${admin.email}`, e);
      }
    }
    // Only mark notified if at least one admin actually got the email — if
    // every send failed (or there are zero ADMIN users), self-heal: the next
    // trigger (next sweep, next release, next payout-request) retries.
    if (sent > 0) {
      await prisma.affiliate.update({ where: { id: affiliateId }, data: { payoutThresholdNotifiedAt: new Date() } });
    }
  } catch (err) {
    logger.error("affiliate", "notifyAdminsIfPayoutEligible failed", err);
  }
}
