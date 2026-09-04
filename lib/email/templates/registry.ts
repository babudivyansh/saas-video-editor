// The registry is the spine of the email system.
//
// The preview page, the XSS test, and (from Phase 1) the opt-out gate and
// List-Unsubscribe headers all read from here, so an email cannot exist without
// declaring which notification category it belongs to. That is the enforcement
// that stops marketing mail shipping without an unsubscribe route.
//
// Deliberately does NOT import NotificationCategory from lib/notifications: that
// module pulls in prisma, which pulls in lib/env, which would drag the whole
// environment into template tests and the preview. The union is duplicated and
// pinned by a type-level assertion in registry.test.ts instead.

import type { EmailDocument } from "../layout";
import * as auth from "./auth";
import * as billing from "./billing";
import * as credits from "./credits";
import * as generations from "./generations";
import * as lifecycle from "./lifecycle";
import * as affiliate from "./affiliate";
import * as reviews from "./reviews";
import * as social from "./social";
import * as admin from "./admin";
import * as newsletter from "./newsletter";
import * as announcements from "./announcements";

export type NotificationCategory =
  | "usageAlerts"
  | "creditAlerts"
  | "productUpdates"
  | "weeklySummary"
  | "featureReleases"
  | "marketingEmails"
  | "newsletter"
  | "reviewPrompts";

/** "transactional" means: always sends, no unsubscribe link, no opt-out check. */
export type EmailCategory = NotificationCategory | "transactional";

export type EmailGroup =
  | "auth"
  | "billing"
  | "credits"
  | "generations"
  | "lifecycle"
  | "affiliate"
  | "reviews"
  | "social"
  | "admin"
  | "newsletter"
  | "announcements";

export interface TemplateEntry<P = Record<string, unknown>> {
  id: string;
  title: string;
  group: EmailGroup;
  category: EmailCategory;
  /** What causes this to be sent — shown in the preview so reviewers have context. */
  trigger: string;
  build: (props: P) => EmailDocument;
  /** "default" plus any edge cases worth eyeballing. */
  samples: Record<string, P>;
}

// Fixed dates so previews and snapshots are stable run to run.
const D = (iso: string) => new Date(iso);
const SOON = D("2026-08-19T00:00:00Z");

function entry<P>(e: TemplateEntry<P>): TemplateEntry<never> {
  return e as unknown as TemplateEntry<never>;
}

export const EMAIL_REGISTRY: Record<string, TemplateEntry<never>> = {
  // ── Auth & security ───────────────────────────────────────────────────────
  otp: entry({
    id: "otp",
    title: "Verification code (OTP)",
    group: "auth",
    category: "transactional",
    trigger: "Login OTP, and admin step-up elevation",
    build: auth.otp,
    samples: { default: { otp: "483920" } },
  }),
  "password-reset": entry({
    id: "password-reset",
    title: "Password reset",
    group: "auth",
    category: "transactional",
    trigger: "Forgot-password request",
    build: auth.passwordReset,
    samples: {
      default: { name: "Divyansh", resetLink: "https://clipiro.com/reset-password?t=abc123" },
      "no name": { name: "", resetLink: "https://clipiro.com/reset-password?t=abc123" },
    },
  }),
  "verify-email": entry({
    id: "verify-email",
    title: "Verify email address",
    group: "auth",
    category: "transactional",
    trigger: "User requests a verification link",
    build: auth.verifyEmail,
    samples: { default: { name: "Divyansh", verifyLink: "https://clipiro.com/verify-email?t=abc123" } },
  }),
  "change-email-confirm": entry({
    id: "change-email-confirm",
    title: "Confirm new email",
    group: "auth",
    category: "transactional",
    trigger: "User changes their account email",
    build: auth.changeEmailConfirm,
    samples: { default: { name: "Divyansh", confirmLink: "https://clipiro.com/change-email?t=abc123" } },
  }),
  "login-alert": entry({
    id: "login-alert",
    title: "New sign-in alert",
    group: "auth",
    category: "transactional",
    trigger: "A sign-in from an unrecognised device",
    build: auth.loginAlert,
    samples: {
      default: {
        name: "Divyansh",
        time: "5 August 2026 at 15:42 IST",
        location: "Mumbai, India",
        device: "Chrome on Windows",
      },
    },
  }),
  "password-changed": entry({
    id: "password-changed",
    title: "Password changed",
    group: "auth",
    category: "transactional",
    trigger: "A password change succeeds",
    build: auth.passwordChanged,
    samples: { default: { name: "Divyansh", time: "5 August 2026 at 15:42 IST" } },
  }),
  "two-factor-changed": entry({
    id: "two-factor-changed",
    title: "Two-factor changed",
    group: "auth",
    category: "transactional",
    trigger: "2FA switched on or off",
    build: auth.twoFactorChanged,
    samples: {
      enabled: { name: "Divyansh", enabled: true, time: "5 August 2026 at 15:42 IST" },
      disabled: { name: "Divyansh", enabled: false, time: "5 August 2026 at 15:42 IST" },
    },
  }),
  "account-export-ready": entry({
    id: "account-export-ready",
    title: "Data export ready",
    group: "auth",
    category: "transactional",
    trigger: "A requested GDPR data export finishes building",
    build: auth.accountExportReady,
    samples: { default: { name: "Divyansh", downloadUrl: "https://clipiro.com/export/abc123.zip" } },
  }),

  // ── Billing ───────────────────────────────────────────────────────────────
  "purchase-confirmation": entry({
    id: "purchase-confirmation",
    title: "Payment confirmed (receipt)",
    group: "billing",
    category: "transactional",
    trigger: "Razorpay one-off purchase or first subscription charge",
    build: billing.purchaseConfirmation,
    samples: {
      subscription: {
        userName: "Divyansh",
        planName: "Studio Monthly",
        creditsAdded: 500,
        amountInPaise: 129900,
        orderId: "order_QxYz1234abcd",
        isSubscription: true,
      },
      "credit pack": {
        userName: "Divyansh",
        planName: "Starter Pack",
        creditsAdded: 100,
        amountInPaise: 29900,
        orderId: "order_QxYz9876wxyz",
        isSubscription: false,
      },
    },
  }),
  "subscription-renewed": entry({
    id: "subscription-renewed",
    title: "Subscription renewed",
    group: "billing",
    category: "transactional",
    trigger: "Recurring Razorpay charge succeeds",
    build: billing.subscriptionRenewed,
    samples: {
      default: { name: "Divyansh", amountInPaise: 129900, creditsAdded: 500, nextChargeAt: D("2026-09-05") },
      "no next charge": { name: "Divyansh", amountInPaise: 129900, creditsAdded: 500, nextChargeAt: null },
    },
  }),
  "payment-failed": entry({
    id: "payment-failed",
    title: "Payment failed (dunning)",
    group: "billing",
    category: "transactional",
    trigger: "Razorpay payment.failed webhook, once per cooldown window",
    build: billing.paymentFailed,
    samples: {
      "with reason": { name: "Divyansh", reason: "Card expired", attempt: 1 },
      "later attempt": { name: "Divyansh", reason: "Insufficient funds", attempt: 3 },
      "no reason": { name: "Divyansh", reason: null, attempt: 1 },
    },
  }),
  "trial-ending": entry({
    id: "trial-ending",
    title: "Trial ending",
    group: "billing",
    category: "transactional",
    trigger: "Cron, one day before a trial converts",
    build: billing.trialEnding,
    samples: {
      default: { name: "Divyansh", planName: "Studio", priceInPaise: 129900, endsAt: SOON },
      "no price": { name: "Divyansh", planName: "Studio", priceInPaise: 0, endsAt: null },
    },
  }),
  "subscription-cancelled": entry({
    id: "subscription-cancelled",
    title: "Subscription cancelled",
    group: "billing",
    category: "transactional",
    trigger: "User cancels their renewal",
    build: billing.subscriptionCancelled,
    samples: { default: { name: "Divyansh", accessUntil: SOON } },
  }),
  "subscription-expiry-warning": entry({
    id: "subscription-expiry-warning",
    title: "Subscription expiring",
    group: "billing",
    category: "creditAlerts",
    trigger: "Cron at 7, 3 and 1 days before expiry",
    build: billing.subscriptionExpiryWarning,
    samples: {
      "7 days": { name: "Divyansh", planName: "Studio", daysLeft: 7, expiryDate: SOON },
      "1 day (urgent)": { name: "Divyansh", planName: "Studio", daysLeft: 1, expiryDate: SOON },
    },
  }),
  "subscription-expired": entry({
    id: "subscription-expired",
    title: "Subscription expired",
    group: "billing",
    category: "creditAlerts",
    trigger: "Cron, once the plan has lapsed",
    build: billing.subscriptionExpired,
    samples: { default: { name: "Divyansh", planName: "Studio", creditsRemaining: 42 } },
  }),

  // ── Credits ───────────────────────────────────────────────────────────────
  "credits-refilled": entry({
    id: "credits-refilled",
    title: "Monthly credits refilled",
    group: "credits",
    category: "creditAlerts",
    trigger: "Monthly refill cron",
    build: credits.creditsRefilled,
    samples: { default: { name: "Divyansh", creditsAdded: 500, newBalance: 542 } },
  }),
  "quest-rank-reward": entry({
    id: "quest-rank-reward",
    title: "Onboarding rank reward",
    group: "credits",
    category: "creditAlerts",
    trigger: "A user crosses an onboarding quest rank and is granted bonus credits",
    build: credits.questRankReward,
    samples: {
      default: { name: "Divyansh", level: "Pro Creator", creditsAdded: 10, newBalance: 52 },
      "top rank": { name: "Divyansh", level: "Clipiro Master", creditsAdded: 20, newBalance: 71 },
    },
  }),
  "low-credits": entry({
    id: "low-credits",
    title: "Low credits warning",
    group: "credits",
    category: "usageAlerts",
    trigger: "Balance drops below ~20% of the monthly allocation",
    build: credits.lowCredits,
    samples: {
      default: { name: "Divyansh", creditsLeft: 12, estimatedVideos: 4 },
      "one left": { name: "Divyansh", creditsLeft: 1, estimatedVideos: 1 },
    },
  }),
  "zero-credits": entry({
    id: "zero-credits",
    title: "Out of credits",
    group: "credits",
    category: "usageAlerts",
    trigger: "A render is attempted with a zero balance",
    build: credits.zeroCredits,
    samples: { default: { name: "Divyansh" } },
  }),
  "unused-credits": entry({
    id: "unused-credits",
    title: "Unused credits reminder",
    group: "credits",
    category: "creditAlerts",
    trigger: "Mid-month re-engagement cron",
    build: credits.unusedCredits,
    samples: { default: { name: "Divyansh", creditsLeft: 380, nextRefillAt: SOON } },
  }),
  "auto-topup-prompt": entry({
    id: "auto-topup-prompt",
    title: "Auto top-up prompt",
    group: "credits",
    category: "usageAlerts",
    trigger: "Balance crosses the auto-top-up threshold (max one per hour)",
    build: credits.autoTopupPrompt,
    samples: {
      default: {
        name: "Divyansh",
        balance: 8,
        packName: "Starter Pack (+100 credits)",
        checkoutUrl: "https://clipiro.com/checkout?pack=starter",
      },
    },
  }),

  // ── Generations ───────────────────────────────────────────────────────────
  "clips-ready": entry({
    id: "clips-ready",
    title: "Your clips are ready",
    group: "generations",
    category: "transactional",
    trigger: "An Auto Clip render finishes with at least one successful clip",
    build: generations.clipsReady,
    samples: {
      default: { name: "Divyansh", readyCount: 3, href: "https://clipiro.com/dashboard/create/auto-clip?project=abc123" },
      "single clip": { name: "Divyansh", readyCount: 1, href: "https://clipiro.com/dashboard/create/auto-clip?project=abc123" },
    },
  }),

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  welcome: entry({
    id: "welcome",
    title: "Welcome",
    group: "lifecycle",
    category: "productUpdates",
    trigger: "Registration, and Google OAuth first sign-in",
    build: lifecycle.welcome,
    samples: { default: { firstName: "Divyansh", credits: 30 } },
  }),
  "onboarding-day-1": entry({
    id: "onboarding-day-1",
    title: "Onboarding day 1",
    group: "lifecycle",
    category: "productUpdates",
    trigger: "Cron, one day after signup with no activity",
    build: lifecycle.onboardingDay1,
    samples: { default: { name: "Divyansh", creditsLeft: 30 } },
  }),
  "onboarding-day-3": entry({
    id: "onboarding-day-3",
    title: "Onboarding day 3",
    group: "lifecycle",
    category: "productUpdates",
    trigger: "Cron, three days after signup — branches on whether they've created anything",
    build: lifecycle.onboardingDay3,
    samples: {
      "has created": { name: "Divyansh", creditsUsed: 12, hasUsed: true },
      "not started": { name: "Divyansh", creditsUsed: 0, hasUsed: false },
    },
  }),
  "onboarding-day-7": entry({
    id: "onboarding-day-7",
    title: "Onboarding day 7",
    group: "lifecycle",
    category: "productUpdates",
    trigger: "Cron, one week after signup",
    build: lifecycle.onboardingDay7,
    samples: { default: { name: "Divyansh", creditsLeft: 18 } },
  }),
  "reengagement-7d": entry({
    id: "reengagement-7d",
    title: "Re-engagement (7 days)",
    group: "lifecycle",
    category: "marketingEmails",
    trigger: "Cron, seven days inactive",
    build: lifecycle.reengagement7Day,
    samples: { default: { name: "Divyansh", creditsLeft: 25 } },
  }),
  "reengagement-30d": entry({
    id: "reengagement-30d",
    title: "Re-engagement (30 days)",
    group: "lifecycle",
    category: "marketingEmails",
    trigger: "Cron, thirty days inactive (win-back)",
    build: lifecycle.reengagement30Day,
    samples: { default: { name: "Divyansh", creditsLeft: 25, daysSinceLogin: 34 } },
  }),
  "first-video-success": entry({
    id: "first-video-success",
    title: "First video success",
    group: "lifecycle",
    category: "marketingEmails",
    trigger: "An hour after a user's first successful render",
    build: lifecycle.firstVideoSuccess,
    samples: { default: { name: "Divyansh" } },
  }),

  // ── Affiliate ─────────────────────────────────────────────────────────────
  "affiliate-referral-signup": entry({
    id: "affiliate-referral-signup",
    title: "Referral signed up",
    group: "affiliate",
    category: "productUpdates",
    trigger: "Someone registers through an affiliate link",
    build: affiliate.referralSignup,
    samples: {
      default: { affiliateName: "Divyansh", referredName: "Aarav Sharma", totalReferrals: 12 },
    },
  }),
  "affiliate-commission": entry({
    id: "affiliate-commission",
    title: "Commission earned",
    group: "affiliate",
    category: "productUpdates",
    trigger: "A referred user makes a purchase",
    build: affiliate.commissionEarned,
    samples: {
      default: {
        affiliateName: "Divyansh",
        commission: 389.7,
        baseAmount: 1299,
        totalEarned: 4821.5,
        availableAt: D("2026-09-04"),
      },
    },
  }),
  "commission-available": entry({
    id: "commission-available",
    title: "Commission ready for payout",
    group: "affiliate",
    category: "productUpdates",
    trigger: "Payout cron, once the 30-day hold expires",
    build: affiliate.commissionAvailable,
    samples: { default: { affiliateName: "Divyansh", amount: 4821.5 } },
  }),

  // ── Reviews ───────────────────────────────────────────────────────────────
  "review-published": entry({
    id: "review-published",
    title: "Review published",
    group: "reviews",
    category: "productUpdates",
    trigger: "An admin approves a review",
    build: reviews.reviewPublished,
    samples: { default: { name: "Divyansh", reviewUrl: "https://clipiro.com/reviews/abc123" } },
  }),
  "review-rejected": entry({
    id: "review-rejected",
    title: "Review not approved",
    group: "reviews",
    category: "productUpdates",
    trigger: "An admin rejects a review",
    build: reviews.reviewRejected,
    samples: {
      "with reason": { name: "Divyansh", reason: "Contains a competitor's contact details." },
      "no reason": { name: "Divyansh" },
    },
  }),
  "review-reply": entry({
    id: "review-reply",
    title: "Reply to your review",
    group: "reviews",
    category: "productUpdates",
    trigger: "An admin replies publicly to a review",
    build: reviews.reviewReply,
    samples: { default: { name: "Divyansh", reviewUrl: "https://clipiro.com/reviews/abc123" } },
  }),
  "review-prompt": entry({
    id: "review-prompt",
    title: "Review prompt",
    group: "reviews",
    category: "reviewPrompts",
    trigger: "Review-prompt cron, and after a qualifying purchase",
    build: reviews.reviewPrompt,
    samples: { default: { name: "Divyansh", reviewUrl: "https://clipiro.com/reviews/new" } },
  }),
  "review-drip-1": entry({
    id: "review-drip-1",
    title: "Review drip 1",
    group: "reviews",
    category: "reviewPrompts",
    trigger: "Drip cron, stage 1 — tracked (open + click)",
    build: reviews.reviewDrip1,
    samples: {
      default: {
        name: "Divyansh",
        ctaUrl: "https://clipiro.com/api/reviews/email-track/click?t=tok&stage=1",
        pixelUrl: "https://clipiro.com/api/reviews/email-track/open?t=tok&stage=1",
      },
    },
  }),
  "review-drip-2": entry({
    id: "review-drip-2",
    title: "Review drip 2",
    group: "reviews",
    category: "reviewPrompts",
    trigger: "Drip cron, stage 2 — tracked",
    build: reviews.reviewDrip2,
    samples: {
      default: {
        name: "Divyansh",
        ctaUrl: "https://clipiro.com/api/reviews/email-track/click?t=tok&stage=2",
        pixelUrl: "https://clipiro.com/api/reviews/email-track/open?t=tok&stage=2",
      },
    },
  }),
  "review-drip-3": entry({
    id: "review-drip-3",
    title: "Review drip 3 (final)",
    group: "reviews",
    category: "reviewPrompts",
    trigger: "Drip cron, stage 3 — tracked, final reminder",
    build: reviews.reviewDrip3,
    samples: {
      default: {
        name: "Divyansh",
        ctaUrl: "https://clipiro.com/api/reviews/email-track/click?t=tok&stage=3",
        pixelUrl: "https://clipiro.com/api/reviews/email-track/open?t=tok&stage=3",
      },
    },
  }),

  // ── Social ────────────────────────────────────────────────────────────────
  "social-digest": entry({
    id: "social-digest",
    title: "Social weekly digest",
    group: "social",
    category: "weeklySummary",
    trigger: "Weekly social-refresh cron (?job=digest)",
    build: social.socialDigest,
    samples: {
      default: {
        name: "Divyansh",
        accounts: [
          { platform: "YouTube", name: "Divyansh Babu", followers: 94, followerDelta: 6, postsThisWeek: 3 },
          { platform: "Instagram", name: "@divyansh.creates", followers: 12400, followerDelta: -128, postsThisWeek: 5 },
        ],
      },
      "single account": {
        name: "Divyansh",
        accounts: [
          { platform: "YouTube", name: "Divyansh Babu", followers: null, followerDelta: null, postsThisWeek: 0 },
        ],
      },
    },
  }),

  // ── Admin ─────────────────────────────────────────────────────────────────
  "admin-ops-digest": entry({
    id: "admin-ops-digest",
    title: "Weekly ops digest (internal)",
    group: "admin",
    category: "transactional",
    trigger: "Weekly admin-digest cron, to every admin",
    build: admin.opsDigest,
    samples: {
      "healthy week": {
        mrrInPaise: 48200000,
        revenueMtdInPaise: 21400000,
        newUsers7d: 214,
        activeSubscribers: 371,
        generations7d: 4821,
        failedGenerations7d: 0,
        syncFailuresToday: 0,
        newReviews7d: 9,
        pendingReviews: 0,
        reportedReviews: 0,
      },
      "problems to chase": {
        mrrInPaise: 48200000,
        revenueMtdInPaise: 21400000,
        newUsers7d: 214,
        activeSubscribers: 371,
        generations7d: 4821,
        failedGenerations7d: 37,
        syncFailuresToday: 4,
        newReviews7d: 9,
        pendingReviews: 6,
        reportedReviews: 2,
      },
    },
  }),
  "contact-message": entry({
    id: "contact-message",
    title: "Contact form submission (internal)",
    group: "admin",
    category: "transactional",
    trigger: "A visitor submits the /contact page form",
    build: admin.contactMessage,
    samples: {
      default: {
        name: "Aarav Sharma",
        email: "aarav@example.com",
        subjectLabel: "Technical support / account issues",
        message: "Hi, I can't access my last render, could you help?",
      },
    },
  }),
  "admin-affiliate-payout-ready": entry({
    id: "admin-affiliate-payout-ready",
    title: "Affiliate payout ready (internal)",
    group: "admin",
    category: "transactional",
    trigger: "An affiliate crosses the payout threshold or requests one",
    build: admin.affiliatePayoutReady,
    samples: {
      threshold: {
        affiliateName: "Aarav Sharma",
        affiliateEmail: "aarav@example.com",
        affiliateCode: "AARAV20",
        availableAmount: 5240,
        minPayoutAmount: 1000,
        trigger: "threshold" as const,
      },
      requested: {
        affiliateName: "Aarav Sharma",
        affiliateEmail: "aarav@example.com",
        affiliateCode: "AARAV20",
        availableAmount: 1250,
        minPayoutAmount: 1000,
        trigger: "requested" as const,
      },
    },
  }),

  // ── Newsletter ────────────────────────────────────────────────────────────
  "newsletter-confirm": entry({
    id: "newsletter-confirm",
    title: "Newsletter double opt-in",
    group: "newsletter",
    category: "transactional",
    trigger: "Blog newsletter signup — the confirmation itself is not marketing",
    build: newsletter.newsletterConfirm,
    samples: { default: { confirmUrl: "https://clipiro.com/api/newsletter/confirm?t=abc123" } },
  }),

  // ── Announcements ────────────────────────────────────────────────────────
  // Same build function registered under both audiences — content is
  // identical, only the opt-out category (and therefore the unsubscribe
  // link) differs. See FeatureAnnouncement in schema.prisma and
  // app/api/cron/feature-announcements.
  "feature-announcement": entry({
    id: "feature-announcement",
    title: "Feature announcement",
    group: "announcements",
    category: "featureReleases",
    trigger: "Admin publishes a FeatureAnnouncement with audience=featureReleases",
    build: announcements.featureAnnouncement,
    samples: {
      default: {
        name: "Alex",
        title: "New: AI Voiceover now supports 12 languages",
        body: "You can now generate voiceovers in Hindi, Spanish, French, and 9 more languages, right from the same tool you already use.",
        ctaLabel: "Try it now",
        ctaUrl: "https://clipiro.com/dashboard",
      },
    },
  }),
  "newsletter-broadcast": entry({
    id: "newsletter-broadcast",
    title: "Newsletter broadcast",
    group: "announcements",
    category: "newsletter",
    trigger: "Admin publishes a FeatureAnnouncement with audience=newsletter",
    build: announcements.featureAnnouncement,
    samples: {
      default: {
        name: "Alex",
        title: "This month at Clipiro",
        body: "A roundup of what shipped, what's coming, and a few creator tips from the community.",
        ctaLabel: "Read more",
        ctaUrl: "https://clipiro.com/dashboard",
      },
    },
  }),
};

export type EmailId = keyof typeof EMAIL_REGISTRY;

export const GROUP_LABELS: Record<EmailGroup, string> = {
  auth: "Auth & security",
  billing: "Billing & receipts",
  credits: "Credits",
  generations: "Renders",
  lifecycle: "Lifecycle & onboarding",
  affiliate: "Affiliate",
  reviews: "Reviews",
  social: "Social Tracker",
  admin: "Admin (internal)",
  newsletter: "Newsletter",
  announcements: "Announcements",
};

export const GROUP_ORDER: EmailGroup[] = [
  "auth",
  "billing",
  "credits",
  "generations",
  "lifecycle",
  "affiliate",
  "reviews",
  "social",
  "admin",
  "newsletter",
  "announcements",
];
