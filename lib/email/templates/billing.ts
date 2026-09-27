// Billing and receipts. All transactional — a receipt is not marketing, and a
// user cannot opt out of being told a payment failed.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { formatDate, formatDateShort, formatMinor, formatPaise, greet, plural } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";

const BILLING_URL = `${APP_URL}/dashboard?billing=1`;
const PRICING_URL = `${APP_URL}/pricing`;

export function purchaseConfirmation(p: {
  userName: string;
  planName: string;
  /** Credits granted BY THIS PAYMENT — for a prepaid annual term that is one
   *  month's allowance, not the term total. */
  creditsAdded: number;
  /** Clip Minutes granted by this payment (a subscription month or a minute
   *  pack). Optional so older callers and samples still render. */
  minutesAdded?: number;
  amountInPaise: number;
  orderId: string;
  isSubscription: boolean;
  /** Set for multi-month prepaid terms, so the receipt can explain that the
   *  remaining months arrive as monthly refills rather than looking short. */
  refill?: { monthlyCredits: number; remainingMonths: number; monthlyMinutes?: number };
  /** Set when a GST tax invoice was issued — its PDF rides along as an attachment. */
  invoiceNumber?: string;
}): EmailDocument {
  const amount = formatPaise(p.amountInPaise);
  const minutes = p.minutesAdded ?? 0;
  // What landed, in words — a minute pack adds no credits, and saying
  // "0 credits added" on its receipt would read as a failed purchase.
  const added = [
    minutes > 0 ? `${minutes} Clip Minutes` : null,
    p.creditsAdded > 0 || minutes === 0 ? `${p.creditsAdded} credits` : null,
  ].filter(Boolean).join(" and ");
  return {
    subject: `Payment confirmed — ${p.planName} activated`,
    preheader: `${amount} paid. ${added} added to your account.`,
    blocks: [
      { kind: "heading", text: `Hi ${greet(p.userName)} — payment confirmed` },
      {
        kind: "paragraph",
        text: `Your ${p.isSubscription ? "subscription" : minutes > 0 && p.creditsAdded === 0 ? "Clip Minutes pack" : "credit pack"} is active and ready to use.`,
      },
      {
        kind: "kv",
        title: "Receipt",
        rows: [
          { label: "Plan", value: p.planName },
          ...(minutes > 0 ? [{ label: "Clip Minutes added", value: `+${minutes} minutes`, tone: "success" as const }] : []),
          ...(p.creditsAdded > 0 || minutes === 0
            ? [{ label: "Credits added", value: `+${p.creditsAdded} credits`, tone: "success" as const }]
            : []),
          ...(p.refill && p.refill.remainingMonths > 0
            ? [{
                label: "Then",
                value: `+${p.refill.monthlyMinutes ? `${p.refill.monthlyMinutes} Clip Minutes and ` : ""}${p.refill.monthlyCredits} credits a month for ${plural(p.refill.remainingMonths, "more month")}`,
              }]
            : []),
          { label: "Amount paid", value: amount },
          { label: "Order ID", value: p.orderId, mono: true },
          ...(p.invoiceNumber ? [{ label: "Tax invoice", value: p.invoiceNumber, mono: true }] : []),
        ],
      },
      { kind: "button", href: `${APP_URL}/dashboard`, label: "Go to dashboard" },
      {
        kind: "paragraph",
        tone: "fine",
        text: p.invoiceNumber
          ? `Your GST tax invoice ${p.invoiceNumber} is attached as a PDF. You can also download it any time from Billing history. Questions? Just reply and we'll get back to you within 24 hours.`
          : "Keep this email as your receipt. Questions? Just reply and we'll get back to you within 24 hours.",
      },
    ],
  };
}

export function subscriptionRenewed(p: {
  name: string;
  amountInPaise: number;
  creditsAdded: number;
  /** Clip Minutes granted by this renewal (after the rollover cap). */
  minutesAdded?: number;
  nextChargeAt: Date | null;
  /** Set when a GST tax invoice was issued — its PDF rides along as an attachment. */
  invoiceNumber?: string;
}): EmailDocument {
  const amount = formatPaise(p.amountInPaise);
  return {
    subject: `Your ${PRODUCT_NAME} subscription renewed — ${amount}`,
    preheader: p.minutesAdded
      ? `${amount} paid. ${p.minutesAdded} Clip Minutes and ${p.creditsAdded} credits added.`
      : `${amount} paid. ${p.creditsAdded} credits added.`,
    blocks: [
      { kind: "heading", text: "Your subscription renewed" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, we've received your payment of <strong>${amount}</strong> and topped your
          account back up.`,
      },
      ...(p.minutesAdded
        ? ([{ kind: "hero", label: "Clip Minutes added", value: String(p.minutesAdded), tone: "brand" }] as const)
        : []),
      { kind: "hero", label: "Credits added", value: String(p.creditsAdded), tone: "brand" },
      { kind: "button", href: BILLING_URL, label: "View billing" },
      ...(p.nextChargeAt
        ? ([
            {
              kind: "paragraph",
              tone: "fine",
              text: `Your next payment is due on ${formatDate(p.nextChargeAt)}.`,
            },
          ] as const)
        : []),
      ...(p.invoiceNumber
        ? ([
            {
              kind: "paragraph",
              tone: "fine",
              text: `Your GST tax invoice ${p.invoiceNumber} is attached as a PDF, and is always available from Billing history.`,
            },
          ] as const)
        : []),
    ],
  };
}

export function paymentFailed(p: { name: string; reason: string | null; attempt: number }): EmailDocument {
  return {
    subject: `Action needed: your ${PRODUCT_NAME} payment didn't go through`,
    preheader: "Your plan is still active — update your payment method to keep it that way.",
    blocks: [
      { kind: "heading", text: "We couldn't process your payment" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, your latest ${PRODUCT_NAME} subscription payment didn't go through.
          <strong>Your plan is still active</strong> — nothing has been taken away yet.`,
      },
      {
        kind: "callout",
        tone: "warning",
        title: p.reason ? "Reason given by the bank" : "Common causes",
        // p.reason comes from the payment provider and is escaped by the block
        // renderer — this used to be interpolated raw.
        body: p.reason
          ? html`${p.reason}<br/>The usual causes are an expired card, insufficient balance, or a bank block on
              recurring payments.`
          : "The usual causes are an expired card, insufficient balance, or a bank block on recurring payments.",
      },
      { kind: "button", href: BILLING_URL, label: "Update payment method" },
      {
        kind: "paragraph",
        tone: "fine",
        text:
          p.attempt > 1
            ? `This was attempt ${p.attempt}. We'll keep retrying for a few days before the plan stops.`
            : "We'll retry automatically over the next few days.",
      },
    ],
  };
}

/**
 * Sent when the trial starts (the mandate is authenticated). The customer has
 * just authorised a mandate while paying ₹0, so the one thing they must not be
 * left unsure about is when — and how much — the first real charge will be,
 * and how to avoid it.
 */
export function trialStarted(p: {
  name: string;
  planName: string;
  /** Minor units of `currency` — paise for INR, cents for USD. */
  priceInPaise: number;
  trialCredits: number;
  /** Clip Minutes granted with the trial (optional so older samples render). */
  trialMinutes?: number;
  endsAt: Date;
  /** The currency the subscription bills in. Defaults to INR. */
  currency?: "INR" | "USD";
}): EmailDocument {
  const when = formatDateShort(p.endsAt);
  const amount = p.priceInPaise ? formatMinor(p.priceInPaise, p.currency) : "";
  const minutes = p.trialMinutes ?? 0;
  const gift = minutes > 0 ? `${minutes} Clip Minutes and ${p.trialCredits} credits` : `${p.trialCredits} credits`;
  return {
    subject: `Your ${PRODUCT_NAME} free trial has started`,
    preheader: `${gift} added. Free until ${when}${amount ? `, then ${amount}/month` : ""}.`,
    blocks: [
      { kind: "heading", text: `Your 7-day ${p.planName} trial has started` },
      {
        kind: "paragraph",
        text: minutes > 0
          ? html`Hi ${greet(p.name)}, you now have ${p.planName}, with <strong>${minutes} Clip Minutes</strong> for Auto Clips and <strong>${p.trialCredits} free credits</strong> for the AI tools to try it with.`
          : html`Hi ${greet(p.name)}, you now have ${p.planName} and <strong>${p.trialCredits} free credits</strong> to try it with.`,
      },
      {
        kind: "kv",
        title: "Your trial",
        rows: [
          { label: "Plan", value: p.planName },
          ...(minutes > 0 ? [{ label: "Trial Clip Minutes", value: `+${minutes} minutes`, tone: "success" as const }] : []),
          { label: "Trial credits", value: `+${p.trialCredits} credits`, tone: "success" },
          { label: "Free until", value: when },
          ...(amount ? [{ label: "Then", value: `${amount} / month, renews automatically` }] : []),
        ],
      },
      {
        kind: "paragraph",
        text: html`Not for you? <strong>Cancel before ${when}</strong> and you won't be charged anything — you'll keep ${p.planName} until the trial ends.`,
      },
      { kind: "button", href: `${BILLING_URL}&view=manage`, label: "Manage trial" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "We'll also email you the day before your trial ends.",
      },
    ],
  };
}

export function trialEnding(p: {
  name: string;
  planName: string;
  /** Minor units of `currency` — paise for INR, cents for USD. */
  priceInPaise: number;
  endsAt: Date | null;
  /** The currency the subscription bills in. Defaults to INR. */
  currency?: "INR" | "USD";
}): EmailDocument {
  // Carries its own preposition: with no end date the fallback is the bare word
  // "tomorrow", and "finishes on tomorrow" is not a sentence.
  const when = p.endsAt ? `on ${formatDateShort(p.endsAt)}` : "tomorrow";
  const amount = p.priceInPaise ? formatMinor(p.priceInPaise, p.currency) : "";
  return {
    subject: `Your ${PRODUCT_NAME} trial ends tomorrow`,
    preheader: `Your trial finishes ${when}. Cancel before then if it isn't for you.`,
    blocks: [
      { kind: "heading", text: "Your free trial ends tomorrow" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, so there are no surprises: your ${PRODUCT_NAME} trial finishes ${when}.
          ${amount
            ? html`Your card will be charged <strong>${amount}</strong> and ${p.planName} continues uninterrupted.`
            : html`Your ${p.planName} plan continues from then.`}`,
      },
      {
        kind: "paragraph",
        text: "If it isn't for you, cancel before then and you won't be charged anything.",
      },
      { kind: "button", href: `${BILLING_URL}&view=manage`, label: "Manage subscription" },
    ],
  };
}

export function subscriptionCancelled(p: { name: string; accessUntil: Date | null }): EmailDocument {
  return {
    subject: `Your ${PRODUCT_NAME} subscription won't renew`,
    preheader: "Cancelled. You keep access until the end of the current period.",
    blocks: [
      { kind: "heading", text: "Your subscription is set to end" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, we've cancelled your renewal, so you won't be charged again.
          ${p.accessUntil
            ? html`You'll keep full access until <strong>${formatDate(p.accessUntil)}</strong>.`
            : "You'll keep access until the end of your current billing period."}`,
      },
      {
        kind: "paragraph",
        text: "Any top-up credits you've bought stay on your account and never expire.",
      },
      { kind: "button", href: BILLING_URL, label: "View billing" },
      { kind: "paragraph", tone: "fine", text: "Changed your mind? You can pick a plan again any time." },
    ],
  };
}

export function subscriptionExpiryWarning(p: {
  name: string;
  planName: string;
  daysLeft: number;
  expiryDate: Date;
}): EmailDocument {
  const urgent = p.daysLeft <= 1;
  return {
    subject: urgent
      ? "Last chance — your subscription expires tomorrow"
      : `${p.daysLeft} days left on your ${PRODUCT_NAME} ${p.planName} plan`,
    preheader: `Your ${p.planName} plan ends on ${formatDate(p.expiryDate)}.`,
    blocks: [
      {
        kind: "heading",
        text: `Your ${p.planName} expires in ${p.daysLeft} ${plural(p.daysLeft, "day")}`,
      },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, your subscription ends on <strong>${formatDate(p.expiryDate)}</strong>. Renew
          to keep your monthly credits and Pro features.`,
      },
      {
        kind: "list",
        title: "What you'll lose after it expires",
        marker: "bullet",
        items: ["Monthly credit refills", "Pro-only tools and features", "Priority rendering"],
      },
      {
        kind: "button",
        href: PRICING_URL,
        label: `Renew ${p.planName}`,
        tone: urgent ? "danger" : "warning",
      },
      { kind: "paragraph", tone: "fine", text: "Renewing takes less than 60 seconds." },
    ],
  };
}

export function subscriptionExpired(p: {
  name: string;
  planName: string;
  creditsRemaining: number;
}): EmailDocument {
  return {
    subject: `Your ${PRODUCT_NAME} ${p.planName} subscription has ended`,
    preheader: `Your ${p.creditsRemaining} existing credits are still safe in your account.`,
    blocks: [
      { kind: "heading", text: `Your ${p.planName} subscription has ended` },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, your ${PRODUCT_NAME} Pro plan has expired. Your
          <strong>${p.creditsRemaining} existing credits</strong> are still safe in your account.`,
      },
      {
        kind: "list",
        title: "On the free tier you can still",
        marker: "check",
        items: [`Use your remaining ${p.creditsRemaining} credits`, "Access the basic tools"],
      },
      {
        kind: "list",
        title: "Resubscribe to get back",
        marker: "bullet",
        items: ["Monthly credit refills", "All Pro AI tools", "Priority rendering queue"],
      },
      { kind: "button", href: PRICING_URL, label: "Pick a plan" },
    ],
  };
}

/**
 * Switch-day notice for the Clip Minutes model (2026-09-26 pricing plan).
 *
 * A service change, not a promotion, so it is TRANSACTIONAL: a subscriber whose
 * monthly credit grant goes down is owed notice whether or not they opted out
 * of marketing. It therefore says exactly what changes for THIS person and
 * when, and sells nothing.
 */
export function clipMinutesLaunch(p: {
  name: string;
  /** "free" or the subscription tier. */
  tier: "free" | "creator" | "pro" | "studio";
  /** The Clip Minutes the account now receives each month. */
  monthlyMinutes: number;
  /** Clip Minutes in the account right now (the switch-day grant included). */
  minutesBalance: number;
  /** The plan's AI-credit grant from the next renewal (50/150/400). */
  newMonthlyCredits: number;
  /** The grant they get today, kept until that renewal (60/160/400). */
  currentMonthlyCredits: number;
  /** Their next renewal, when the new credit grant starts; null for free. */
  renewsAt: Date | null;
}): EmailDocument {
  const paid = p.tier !== "free";
  const creditsChange = paid && p.newMonthlyCredits !== p.currentMonthlyCredits;
  return {
    subject: `Auto Clips now use Clip Minutes — ${p.minutesBalance} are in your account`,
    preheader: `1 minute per minute of video, any number of clips. Your AI credits stay for the AI tools.`,
    blocks: [
      { kind: "heading", text: "Auto Clips now run on Clip Minutes" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, we've changed how Auto Clips are paid for. Instead of credits per clip, a run now uses
          <strong>1 Clip Minute per minute of video</strong> — a 45-minute podcast uses 45 minutes whether you ask for 3 clips or 20.
          Your AI credits now go only to the AI tools, dubbing and premium captions.`,
      },
      {
        kind: "kv",
        title: paid ? "Your plan" : "Your free account",
        rows: [
          { label: "Clip Minutes in your account", value: `${p.minutesBalance}`, tone: "success" },
          { label: "Clip Minutes each month", value: `${p.monthlyMinutes}${paid ? "" : " (watermarked)"}` },
          creditsChange
            ? {
                label: "AI credits each month",
                value: `${p.currentMonthlyCredits} until ${p.renewsAt ? formatDate(p.renewsAt) : "your next renewal"}, then ${p.newMonthlyCredits}`,
              }
            : { label: "AI credits each month", value: `${p.newMonthlyCredits}` },
        ],
      },
      {
        kind: "list",
        title: "Also new",
        marker: "bullet",
        items: [
          "Re-running the same video within 7 days is free.",
          "A run that fails is refunded in full, automatically.",
          "Short on minutes? Top up with a minute pack, or choose to pay the rest in AI credits (3 minutes = 1 credit).",
          "Credits and minutes you already have are untouched.",
        ],
      },
      ...(creditsChange
        ? ([{
            kind: "paragraph",
            tone: "fine",
            text: `Why fewer AI credits from your next renewal? Auto Clips no longer spend credits at all, and they were what most credits went on — the ${p.monthlyMinutes} Clip Minutes a month replace them. If this doesn't work for you, reply to this email and we'll help.`,
          }] as const)
        : []),
      { kind: "button", href: `${APP_URL}/dashboard/create/auto-clip`, label: "Try Auto Clips" },
      { kind: "paragraph", tone: "fine", text: `Full details are on the pricing page: ${PRICING_URL}` },
    ],
  };
}
