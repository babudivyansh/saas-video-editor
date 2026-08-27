// Every email the product sends.
//
// This file used to be 1310 lines of inline HTML. It is now a facade: each
// function keeps its exact name and signature — 39 source files and 12 test
// files import from here — and delegates to lib/email/send.ts, which renders a
// registered template and delivers it.
//
// What moved, and why it mattered:
//   • Templates      -> lib/email/templates/* (typed blocks, not HTML strings)
//   • Escaping       -> lib/email/html.ts (there was none; values went in raw)
//   • Layout         -> lib/email/layout.ts (there was no <head>, so no
//                       preheader and no media queries were possible)
//   • Plain text     -> lib/email/text.ts (every email was HTML-only)
//   • Transport      -> lib/email/send.ts (no retries; reported success even
//                       when nothing had been sent)
//   • Opt-out + unsubscribe -> handled centrally by category, so a marketing
//                       email cannot ship without a way out of it
//
// Callers that already check shouldSendCategory before calling still work —
// sendTemplate performs the same check, so it is now redundant rather than
// load-bearing. Leaving those checks in place is deliberate: removing them is a
// separate change with its own review.

import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";
import { signTrackToken } from "@/lib/reviews/email-track-token";
import { sendTemplate } from "@/lib/email/send";
import { APP_URL } from "@/lib/email/tokens";
import type { SocialDigestAccount } from "@/lib/email/templates/social";
import type { AdminDigestData } from "@/lib/email/templates/admin";

export type { SocialDigestAccount, AdminDigestData };

/** Retained for sendOtpEmail's return type, which callers switch on. */
export type DeliveryChannel = "email" | "sms" | "dev-console";

// ─────────────────────────────────────────────────────────────────────────────
// Auth & security — all transactional
// ─────────────────────────────────────────────────────────────────────────────

export async function sendOtpEmail(to: string, otp: string): Promise<DeliveryChannel> {
  const r = await sendTemplate("otp", to, { otp });
  return r.channel === "dev-console" ? "dev-console" : "email";
}

export async function sendPasswordResetEmail(to: string, name: string, resetLink: string): Promise<void> {
  await sendTemplate("password-reset", to, { name, resetLink });
}

export async function sendVerifyEmailEmail(to: string, name: string, verifyLink: string): Promise<void> {
  await sendTemplate("verify-email", to, { name, verifyLink });
}

export async function sendChangeEmailConfirmationEmail(
  to: string, name: string, confirmLink: string,
): Promise<void> {
  await sendTemplate("change-email-confirm", to, { name, confirmLink });
}

export async function sendNewLoginAlertEmail(
  to: string, name: string, time: string, location: string, device: string,
): Promise<void> {
  await sendTemplate("login-alert", to, { name, time, location, device });
}

export async function sendPasswordChangedAlertEmail(to: string, name: string, time: string): Promise<void> {
  await sendTemplate("password-changed", to, { name, time });
}

export async function sendTwoFactorChangedAlertEmail(
  to: string, name: string, enabled: boolean, time: string,
): Promise<void> {
  await sendTemplate("two-factor-changed", to, { name, enabled, time });
}

export async function sendAccountExportReadyEmail(
  to: string, name: string, downloadUrl: string,
): Promise<void> {
  await sendTemplate("account-export-ready", to, { name, downloadUrl });
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing — all transactional
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseEmailData {
  userEmail: string;
  userName: string;
  planName: string;
  creditsAdded: number;
  amountInPaise: number;
  orderId: string;
  isSubscription: boolean;
}

export async function sendPurchaseConfirmationEmail(data: PurchaseEmailData): Promise<void> {
  await sendTemplate("purchase-confirmation", data.userEmail, {
    userName: data.userName,
    planName: data.planName,
    creditsAdded: data.creditsAdded,
    amountInPaise: data.amountInPaise,
    orderId: data.orderId,
    isSubscription: data.isSubscription,
  });
}

export async function sendSubscriptionRenewedEmail(
  to: string, name: string, amountInPaise: number, creditsAdded: number, nextChargeAt: Date | null,
): Promise<void> {
  await sendTemplate("subscription-renewed", to, { name, amountInPaise, creditsAdded, nextChargeAt });
}

export async function sendPaymentFailedEmail(
  to: string, name: string, reason: string | null, attempt: number,
): Promise<void> {
  await sendTemplate("payment-failed", to, { name, reason, attempt });
}

export async function sendTrialEndingEmail(
  to: string, name: string, planName: string, priceInPaise: number, endsAt: Date | null,
): Promise<void> {
  await sendTemplate("trial-ending", to, { name, planName, priceInPaise, endsAt });
}

export async function sendSubscriptionCancelledEmail(
  to: string, name: string, accessUntil: Date | null,
): Promise<void> {
  await sendTemplate("subscription-cancelled", to, { name, accessUntil });
}

export async function sendSubscriptionExpiryWarningEmail(
  to: string, name: string, planName: string, daysLeft: number, expiryDate: Date,
): Promise<void> {
  await sendTemplate("subscription-expiry-warning", to, { name, planName, daysLeft, expiryDate });
}

export async function sendSubscriptionExpiredEmail(
  to: string, name: string, planName: string, creditsRemaining: number,
): Promise<void> {
  await sendTemplate("subscription-expired", to, { name, planName, creditsRemaining });
}

// ─────────────────────────────────────────────────────────────────────────────
// Credits
// ─────────────────────────────────────────────────────────────────────────────

export async function sendCreditsRefilledEmail(
  to: string, name: string, creditsAdded: number, newBalance: number,
): Promise<void> {
  await sendTemplate("credits-refilled", to, { name, creditsAdded, newBalance });
}

export async function sendLowCreditsEmail(
  to: string, name: string, creditsLeft: number, estimatedVideos: number,
): Promise<void> {
  await sendTemplate("low-credits", to, { name, creditsLeft, estimatedVideos });
}

export async function sendZeroCreditsEmail(to: string, name: string): Promise<void> {
  await sendTemplate("zero-credits", to, { name });
}

export async function sendUnusedCreditsReminderEmail(
  to: string, name: string, creditsLeft: number, nextRefillAt: Date,
): Promise<void> {
  await sendTemplate("unused-credits", to, { name, creditsLeft, nextRefillAt });
}

export async function sendAutoTopupPromptEmail(
  to: string, name: string, balance: number, packName: string, checkoutUrl: string,
): Promise<void> {
  await sendTemplate("auto-topup-prompt", to, { name, balance, packName, checkoutUrl });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, firstName: string, credits: number): Promise<void> {
  await sendTemplate("welcome", to, { firstName, credits });
}

export async function sendOnboardingDay1Email(
  to: string, name: string, creditsLeft: number,
): Promise<void> {
  await sendTemplate("onboarding-day-1", to, { name, creditsLeft });
}

export async function sendOnboardingDay3Email(
  to: string, name: string, creditsUsed: number, hasUsed: boolean,
): Promise<void> {
  await sendTemplate("onboarding-day-3", to, { name, creditsUsed, hasUsed });
}

export async function sendOnboardingDay7Email(
  to: string, name: string, creditsLeft: number,
): Promise<void> {
  await sendTemplate("onboarding-day-7", to, { name, creditsLeft });
}

export async function sendReengagement7DayEmail(
  to: string, name: string, creditsLeft: number,
): Promise<void> {
  await sendTemplate("reengagement-7d", to, { name, creditsLeft });
}

export async function sendReengagement30DayEmail(
  to: string, name: string, creditsLeft: number, daysSinceLogin: number,
): Promise<void> {
  await sendTemplate("reengagement-30d", to, { name, creditsLeft, daysSinceLogin });
}

/** Returns false on a delivery failure, so the one-shot caller in
 * lib/credit-events.ts can avoid marking this sent until it actually is. */
export async function sendFirstVideoSuccessEmail(to: string, name: string): Promise<boolean> {
  const r = await sendTemplate("first-video-success", to, { name });
  return r.status !== "failed";
}

// ─────────────────────────────────────────────────────────────────────────────
// Affiliate
// ─────────────────────────────────────────────────────────────────────────────

export async function sendAffiliateReferralSignupEmail(
  to: string, affiliateName: string, referredName: string, totalReferrals: number,
): Promise<void> {
  await sendTemplate("affiliate-referral-signup", to, { affiliateName, referredName, totalReferrals });
}

export async function sendAffiliateCommissionEmail(
  to: string, affiliateName: string, commission: number, baseAmount: number,
  totalEarned: number, availableAt: Date,
): Promise<void> {
  await sendTemplate("affiliate-commission", to, {
    affiliateName, commission, baseAmount, totalEarned, availableAt,
  });
}

export async function sendCommissionAvailableEmail(
  to: string, affiliateName: string, amount: number,
): Promise<void> {
  await sendTemplate("commission-available", to, { affiliateName, amount });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────────────────────────────────────

export async function sendReviewPublishedEmail(
  to: string, name: string, reviewUrl: string,
): Promise<void> {
  await sendTemplate("review-published", to, { name, reviewUrl });
}

export async function sendReviewRejectedEmail(to: string, name: string, reason?: string): Promise<void> {
  await sendTemplate("review-rejected", to, { name, reason });
}

export async function sendReviewReplyEmail(to: string, name: string, reviewUrl: string): Promise<void> {
  await sendTemplate("review-reply", to, { name, reviewUrl });
}

export async function sendReviewPromptEmail(to: string, name: string, reviewUrl: string): Promise<void> {
  await sendTemplate("review-prompt", to, { name, reviewUrl });
}

/**
 * Review drip tracking.
 *
 * Built here rather than in the template because signTrackToken needs
 * JWT_SECRET, and the render layer is deliberately kept free of lib/env so
 * templates stay unit-testable and previewable without an environment.
 * SITE_URL_FOR_TRACKING, which hardcoded the production host, is gone — these
 * now follow APP_URL like every other link.
 */
type DripStage = 1 | 2 | 3;

function trackedCtaUrl(userId: string, stage: DripStage, targetUrl: string): string {
  const token = signTrackToken(userId, stage);
  return `${APP_URL}/api/reviews/email-track/click?t=${encodeURIComponent(token)}&stage=${stage}&to=${encodeURIComponent(targetUrl)}`;
}

function openPixelUrl(userId: string, stage: DripStage): string {
  const token = signTrackToken(userId, stage);
  return `${APP_URL}/api/reviews/email-track/open?t=${encodeURIComponent(token)}&stage=${stage}`;
}

async function sendDrip(
  stage: DripStage, to: string, name: string, userId: string, reviewUrl: string,
): Promise<void> {
  await sendTemplate(
    `review-drip-${stage}`,
    to,
    { name, ctaUrl: trackedCtaUrl(userId, stage, reviewUrl), pixelUrl: openPixelUrl(userId, stage) },
    { userId },
  );
}

export async function sendReviewDripEmail1(
  to: string, name: string, userId: string, reviewUrl: string,
): Promise<void> {
  await sendDrip(1, to, name, userId, reviewUrl);
}

export async function sendReviewDripEmail2(
  to: string, name: string, userId: string, reviewUrl: string,
): Promise<void> {
  await sendDrip(2, to, name, userId, reviewUrl);
}

export async function sendReviewDripEmail3(
  to: string, name: string, userId: string, reviewUrl: string,
): Promise<void> {
  await sendDrip(3, to, name, userId, reviewUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Social, admin, newsletter
// ─────────────────────────────────────────────────────────────────────────────

export async function sendSocialDigestEmail(
  to: string, name: string, accounts: SocialDigestAccount[],
): Promise<void> {
  await sendTemplate("social-digest", to, { name, accounts });
}

export async function sendAdminDigestEmail(to: string, d: AdminDigestData): Promise<void> {
  await sendTemplate("admin-ops-digest", to, d);
}

export interface AdminAffiliatePayoutReadyData {
  affiliateName: string;
  affiliateEmail: string;
  affiliateCode: string;
  availableAmount: number;
  trigger: "threshold" | "requested";
}

export async function sendAdminAffiliatePayoutReadyEmail(
  to: string, d: AdminAffiliatePayoutReadyData,
): Promise<void> {
  await sendTemplate("admin-affiliate-payout-ready", to, {
    ...d,
    minPayoutAmount: MIN_PAYOUT_AMOUNT,
  });
}

export async function sendNewsletterConfirmEmail(to: string, confirmUrl: string): Promise<void> {
  await sendTemplate("newsletter-confirm", to, { confirmUrl });
}
