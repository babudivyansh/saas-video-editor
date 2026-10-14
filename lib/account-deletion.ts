// Shared hard-delete core, used by the user-initiated DELETE /api/auth/profile
// route (step-up-confirmed, interactive), the admin user-delete routes and the
// deactivation cron's scheduled purge (no password available — the account
// owner already authenticated once, at deactivation time, and the 30-day
// window has since passed). Keeping one implementation means the paths can't
// silently diverge on what "delete an account" actually does.
//
// Two outcomes, both a completed deletion from the user's point of view:
//
//   "deleted"    — no billing history: the User row is deleted and the schema's
//                  cascades remove everything else.
//   "anonymised" — the account owns Purchase/Invoice rows, which are
//                  onDelete: Restrict because tax law requires keeping them
//                  (GST: 72 months from the annual return's due date). The
//                  User row stays as a tombstone so those foreign keys hold,
//                  every other row the cascade would have removed is deleted
//                  explicitly, and the row's personal fields are cleared.
//                  Each Invoice already snapshots the buyer's name, email,
//                  address, state and GSTIN at issue, so clearing them on the
//                  User row never alters an issued invoice.

import { prisma } from "@/lib/prisma";
import { invalidateAllSessions } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { cancelRazorpaySubscriptionBestEffort } from "@/lib/billing/cancel-on-account-lifecycle";
import { collectProjectMediaKeys, collectUserAssetKeys, deleteUnreferencedKeys } from "@/lib/storage-cleanup";
import { s3KeyFromStoredUrl } from "@/lib/source-url";
import { deleteClonedVoice } from "@/utils/elevenlabs";
import { tombstoneEmail } from "@/lib/account-tombstone";

export type DeleteAccountResult =
  | { ok: true; mode: "deleted" | "anonymised" }
  | { ok: false; reason: string };

// Every model with a relation to User, split by what an anonymising purge does
// with it. lib/account-deletion.test.ts parses prisma/schema.prisma and fails
// if a model is in neither list — a new user-owned table has to be classified
// here, or a paying customer's copy of it would outlive their deletion.
export const PURGED_USER_MODELS = [
  "Project", // cascades Clip, ClipDub, CaptionRenderJob and the rest of a project
  "ClipPublish", // posts made from an asset outlive the project cascade (assetId is SetNull)
  "Asset",
  "AssetFolder",
  "Tag",
  "AssetAuditLog",
  "PendingUpload",
  "SocialAccount", // cascades its snapshots, posts and tokens
  "CompetitorProfile",
  "SocialGoal",
  "SocialReportConfig",
  "SocialReportRun",
  "SocialReportLink",
  "Generation",
  "ApiKey",
  "BrandKit",
  "ClonedVoice",
  "Review",
  "ReviewAttachment",
  "ReviewHelpfulVote",
  "ReviewReport",
  "ReviewPromptState",
  "ReviewPromptEvent",
  "ReviewEmailSequence",
  "Notification",
  "NotificationPreference",
  "UserQuest",
  "CreditTransaction",
  "MinuteTransaction",
  "SubscriptionEvent",
  "LoginEvent",
  "TwoFactorRecoveryCode",
  "DeviceToken",
  "AssistantMessage",
  "ClipCollection", // cascades its ClipCollectionItem rows
] as const;

export const RETAINED_USER_MODELS = [
  "Purchase", // legal retention
  "Invoice", // legal retention; carries its own buyer snapshot
  "Affiliate", // another party's commission/payout records hang off these
  "Referral",
] as const;

export async function hardDeleteUserAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, avatarUrl: true, razorpaySubscriptionId: true, deactivatedAt: true, purgedAt: true },
  });
  if (!user) return { ok: false, reason: "Account not found." };
  if (user.purgedAt) return { ok: true, mode: "anonymised" };

  // razorpaySubscriptionId can exist without a Purchase row in edge cases
  // (e.g. trial-only) — check unconditionally so no account is deleted while
  // Razorpay is left auto-charging a mandate no one can reach anymore.
  // Best-effort: a Razorpay outage must not block the user's own delete
  // request; this runs before the writes below so it still has a live row
  // for context if it needs to log one.
  if (user.razorpaySubscriptionId) {
    await cancelRazorpaySubscriptionBestEffort(user.razorpaySubscriptionId, userId, "delete");
  }

  // Storage and third-party voices are gathered while the rows still exist and
  // removed once they're gone — the DB writes remove the rows only
  // (lib/storage-cleanup.ts). An avatar we host is the user's too.
  const avatarKey = user.avatarUrl ? s3KeyFromStoredUrl(user.avatarUrl) : null;
  const storageKeys = [
    ...(await collectUserAssetKeys(userId)),
    ...(await collectProjectMediaKeys({ userId })),
    ...(avatarKey ? [avatarKey] : []),
  ];
  const voices = await prisma.clonedVoice.findMany({ where: { userId }, select: { elevenLabsVoiceId: true } });

  const hasBillingHistory = (await prisma.purchase.count({ where: { userId } })) > 0;
  let mode: "deleted" | "anonymised";
  if (!hasBillingHistory) {
    // Affiliate/Referral/Commission rows have no onDelete: Cascade, so they
    // must be cleared before the User row can go. Everything else cascades.
    await prisma.$transaction([
      prisma.commission.deleteMany({ where: { referral: { referredUserId: userId } } }),
      prisma.referral.deleteMany({ where: { referredUserId: userId } }),
      prisma.commission.deleteMany({ where: { affiliate: { userId } } }),
      prisma.referral.deleteMany({ where: { affiliate: { userId } } }),
      prisma.affiliate.deleteMany({ where: { userId } }),
      deleteEmailLogs(userId, user.email),
      prisma.user.delete({ where: { id: userId } }),
    ]);
    mode = "deleted";
  } else {
    await prisma.$transaction(anonymiseOps(userId, user.email, user.deactivatedAt));
    mode = "anonymised";
  }

  await Promise.allSettled([
    invalidateAllSessions(userId),
    redis.del(`credits:${userId}`),
    deleteUnreferencedKeys([...new Set(storageKeys)], `account ${userId}`),
    ...voices.map((v) =>
      deleteClonedVoice(v.elevenLabsVoiceId).catch((e: unknown) =>
        logger.warn("account-deletion", `ElevenLabs voice delete failed for ${v.elevenLabsVoiceId}`, { reason: (e as Error).message }),
      ),
    ),
  ]);

  return { ok: true, mode };
}

// Delivery logs carry the address itself and have no FK to cascade from.
function deleteEmailLogs(userId: string, email: string) {
  return prisma.emailLog.deleteMany({ where: { OR: [{ userId }, { recipient: email }] } });
}

// One transaction: the account is either fully purged or untouched, never a
// half-deleted row that still signs in. Order follows the FKs — projects
// before the assets they may reference, assets before their folders.
function anonymiseOps(
  userId: string,
  email: string,
  deactivatedAt: Date | null,
) {
  const where = { userId };
  const now = new Date();
  return [
    prisma.clipPublish.deleteMany({ where }),
    prisma.project.deleteMany({ where }),
    prisma.asset.deleteMany({ where }),
    prisma.assetFolder.deleteMany({ where }),
    prisma.tag.deleteMany({ where }),
    prisma.assetAuditLog.deleteMany({ where }),
    prisma.pendingUpload.deleteMany({ where }),
    prisma.socialAccount.deleteMany({ where }),
    prisma.competitorProfile.deleteMany({ where }),
    prisma.socialGoal.deleteMany({ where }),
    prisma.socialReportConfig.deleteMany({ where }),
    prisma.socialReportRun.deleteMany({ where }),
    prisma.socialReportLink.deleteMany({ where }),
    prisma.generation.deleteMany({ where }),
    prisma.apiKey.deleteMany({ where }),
    prisma.brandKit.deleteMany({ where }),
    prisma.clonedVoice.deleteMany({ where }),
    prisma.reviewAttachment.deleteMany({ where }),
    prisma.reviewHelpfulVote.deleteMany({ where }),
    prisma.reviewReport.deleteMany({ where }),
    prisma.review.deleteMany({ where }),
    prisma.reviewPromptState.deleteMany({ where }),
    prisma.reviewPromptEvent.deleteMany({ where }),
    prisma.reviewEmailSequence.deleteMany({ where }),
    prisma.notification.deleteMany({ where }),
    prisma.notificationPreference.deleteMany({ where }),
    prisma.userQuest.deleteMany({ where }),
    prisma.creditTransaction.deleteMany({ where }),
    prisma.minuteTransaction.deleteMany({ where }),
    prisma.subscriptionEvent.deleteMany({ where }),
    prisma.loginEvent.deleteMany({ where }),
    prisma.twoFactorRecoveryCode.deleteMany({ where }),
    prisma.deviceToken.deleteMany({ where }),
    prisma.assistantMessage.deleteMany({ where }),
    prisma.clipCollection.deleteMany({ where }),
    deleteEmailLogs(userId, email),
    // Kept rows, stripped of what identifies a person: the sign-up IP on the
    // referral, and a still-redeemable code on the user's own affiliate row.
    prisma.referral.updateMany({ where: { referredUserId: userId }, data: { signupIp: null } }),
    prisma.affiliate.updateMany({ where: { userId }, data: { status: "suspended", codeExpiresAt: now } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        purgedAt: now,
        // Login is refused while this is set; keep the original date if the
        // user deactivated first. Clearing the scheduled date takes the row
        // out of the account-purge cron's query for good.
        deactivatedAt: deactivatedAt ?? now,
        deactivationScheduledPurgeAt: null,
        email: tombstoneEmail(userId),
        pendingEmail: null,
        emailVerifiedAt: null,
        // Not a bcrypt hash, so no password can ever match it.
        passwordHash: "",
        hasPassword: false,
        passwordChangedAt: null,
        twoFactorEnabled: false,
        twoFactorSecretEnc: null,
        twoFactorLastUsedStep: null,
        role: "USER",
        name: null,
        avatarUrl: null,
        gender: null,
        intendedUse: null,
        primaryGoal: null,
        experienceLevel: null,
        teamOrIndividual: null,
        adminNotes: null,
        captionVocabulary: [],
        dismissedHints: [],
        claimedRankRewards: [],
        billingName: null,
        billingAddress: null,
        billingState: null,
        billingPincode: null,
        billingGstin: null,
        // No plan, balance or billing state left for a cron to act on.
        planId: null,
        subscriptionId: null,
        subscriptionEndsAt: null,
        subscriptionCancelledAt: null,
        subscriptionCurrency: null,
        razorpaySubscriptionId: null,
        razorpayCustomerId: null,
        nextRefillAt: null,
        freeCreditsRefillAt: null,
        trialEndsAt: null,
        paymentFailedAt: null,
        paymentFailureCount: 0,
        autoTopupPackSlug: null,
        monthlyCredits: 0,
        monthlyMinutes: 0,
        credits: 0,
        subscriptionCredits: 0,
        purchasedCredits: 0,
        bonusCredits: 0,
        bonusCreditsExpireAt: null,
        minutes: 0,
        subscriptionMinutes: 0,
        purchasedMinutes: 0,
        bonusMinutes: 0,
        bonusMinutesExpireAt: null,
        lastLoginAt: null,
        tourStep: null,
      },
    }),
  ];
}
