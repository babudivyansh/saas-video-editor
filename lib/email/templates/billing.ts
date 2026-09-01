// Billing and receipts. All transactional — a receipt is not marketing, and a
// user cannot opt out of being told a payment failed.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { formatDate, formatDateShort, formatPaise, greet, plural } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";

const BILLING_URL = `${APP_URL}/dashboard?billing=1`;
const PRICING_URL = `${APP_URL}/pricing`;

export function purchaseConfirmation(p: {
  userName: string;
  planName: string;
  /** Credits granted BY THIS PAYMENT — for a prepaid annual term that is one
   *  month's allowance, not the term total. */
  creditsAdded: number;
  amountInPaise: number;
  orderId: string;
  isSubscription: boolean;
  /** Set for multi-month prepaid terms, so the receipt can explain that the
   *  remaining months arrive as monthly refills rather than looking short. */
  refill?: { monthlyCredits: number; remainingMonths: number };
}): EmailDocument {
  const amount = formatPaise(p.amountInPaise);
  return {
    subject: `Payment confirmed — ${p.planName} activated`,
    preheader: `${amount} paid. ${p.creditsAdded} credits added to your account.`,
    blocks: [
      { kind: "heading", text: `Hi ${greet(p.userName)} — payment confirmed` },
      {
        kind: "paragraph",
        text: `Your ${p.isSubscription ? "subscription" : "credit pack"} is active and ready to use.`,
      },
      {
        kind: "kv",
        title: "Receipt",
        rows: [
          { label: "Plan", value: p.planName },
          { label: "Credits added", value: `+${p.creditsAdded} credits`, tone: "success" },
          ...(p.refill && p.refill.remainingMonths > 0
            ? [{
                label: "Then",
                value: `+${p.refill.monthlyCredits} credits a month for ${plural(p.refill.remainingMonths, "more month")}`,
              }]
            : []),
          { label: "Amount paid", value: amount },
          { label: "Order ID", value: p.orderId, mono: true },
        ],
      },
      { kind: "button", href: `${APP_URL}/dashboard`, label: "Go to dashboard" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "Keep this email as your receipt. Questions? Just reply and we'll get back to you within 24 hours.",
      },
    ],
  };
}

export function subscriptionRenewed(p: {
  name: string;
  amountInPaise: number;
  creditsAdded: number;
  nextChargeAt: Date | null;
}): EmailDocument {
  const amount = formatPaise(p.amountInPaise);
  return {
    subject: `Your ${PRODUCT_NAME} subscription renewed — ${amount}`,
    preheader: `${amount} paid. ${p.creditsAdded} credits added.`,
    blocks: [
      { kind: "heading", text: "Your subscription renewed" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, we've received your payment of <strong>${amount}</strong> and topped your
          account back up.`,
      },
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

export function trialEnding(p: {
  name: string;
  planName: string;
  priceInPaise: number;
  endsAt: Date | null;
}): EmailDocument {
  // Carries its own preposition: with no end date the fallback is the bare word
  // "tomorrow", and "finishes on tomorrow" is not a sentence.
  const when = p.endsAt ? `on ${formatDateShort(p.endsAt)}` : "tomorrow";
  const amount = p.priceInPaise ? formatPaise(p.priceInPaise) : "";
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
