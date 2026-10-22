// Internal operations email. Transactional in the sense that matters here: it
// goes to staff, never to customers, and carries no unsubscribe.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { formatCount, formatPaise, formatRupees } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";

export interface AdminDigestData {
  mrrInPaise: number;
  revenueMtdInPaise: number;
  newUsers7d: number;
  activeSubscribers: number;
  generations7d: number;
  failedGenerations7d: number;
  syncFailuresToday: number;
  newReviews7d: number;
  pendingReviews: number;
  reportedReviews: number;
}

export function opsDigest(d: AdminDigestData): EmailDocument {
  /** Anything above zero is a problem for these rows; zero is the good state. */
  const alarm = (n: number) => (n > 0 ? ("danger" as const) : ("success" as const));
  const warn = (n: number) => (n > 0 ? ("warning" as const) : ("success" as const));

  return {
    subject: `${PRODUCT_NAME} weekly ops digest`,
    preheader: `MRR ${formatPaise(d.mrrInPaise)} · ${formatCount(d.activeSubscribers)} active subscribers · ${formatCount(d.newUsers7d)} new users this week.`,
    blocks: [
      { kind: "heading", text: "Weekly ops digest" },
      { kind: "paragraph", text: "The numbers that matter, straight from the admin metrics engine." },
      {
        kind: "kv",
        title: "Revenue",
        rows: [
          { label: "MRR", value: formatPaise(d.mrrInPaise), tone: "brand" },
          { label: "Revenue this month", value: formatPaise(d.revenueMtdInPaise) },
          { label: "Active subscribers", value: formatCount(d.activeSubscribers) },
        ],
      },
      {
        kind: "kv",
        title: "Usage",
        rows: [
          { label: "New users (7d)", value: formatCount(d.newUsers7d) },
          { label: "Generations (7d)", value: formatCount(d.generations7d) },
          {
            label: "Failed generations (7d)",
            value: formatCount(d.failedGenerations7d),
            tone: alarm(d.failedGenerations7d),
          },
          {
            label: "Social sync failures today",
            value: formatCount(d.syncFailuresToday),
            tone: alarm(d.syncFailuresToday),
          },
        ],
      },
      {
        kind: "kv",
        title: "Reviews",
        rows: [
          { label: "New reviews (7d)", value: formatCount(d.newReviews7d) },
          { label: "Pending reviews", value: formatCount(d.pendingReviews), tone: warn(d.pendingReviews) },
          { label: "Reported reviews", value: formatCount(d.reportedReviews), tone: alarm(d.reportedReviews) },
        ],
      },
      { kind: "button", href: `${APP_URL}/admin`, label: "Open admin dashboard" },
    ],
  };
}

export interface AdminAffiliatePayoutReadyData {
  affiliateName: string;
  affiliateEmail: string;
  affiliateCode: string;
  availableAmount: number;
  minPayoutAmount: number;
  trigger: "threshold" | "requested";
}

export interface ContactMessageData {
  name: string;
  email: string;
  /** Already resolved to a display string by the route — this template
   * stays dumb/data-in like every other template here, matching how
   * planName/affiliateCode etc. arrive pre-resolved rather than as enums. */
  subjectLabel: string;
  message: string;
}

export function contactMessage(d: ContactMessageData): EmailDocument {
  return {
    subject: `Contact form: ${d.subjectLabel} — ${d.name}`,
    preheader: `${d.name} (${d.email}) sent a message via the contact form.`,
    blocks: [
      { kind: "heading", text: "New contact form submission" },
      {
        kind: "kv",
        rows: [
          { label: "From", value: d.name },
          { label: "Email", value: d.email },
          { label: "Category", value: d.subjectLabel },
        ],
      },
      { kind: "callout", tone: "neutral", title: "Message", body: d.message },
    ],
  };
}

export function affiliatePayoutReady(d: AdminAffiliatePayoutReadyData): EmailDocument {
  const who = d.affiliateName || d.affiliateEmail;
  const amount = formatRupees(d.availableAmount);
  return {
    subject: `Payout ready: ${d.affiliateCode} — ${amount}`,
    preheader: `${who} has ${amount} available for payout.`,
    blocks: [
      {
        kind: "heading",
        text:
          d.trigger === "requested"
            ? `${who} requested a payout`
            : `${who} crossed the ${formatRupees(d.minPayoutAmount)} payout threshold`,
      },
      {
        kind: "paragraph",
        text: html`${d.affiliateEmail} (<code>${d.affiliateCode}</code>) has ${amount} available for payout.`,
      },
      { kind: "hero", label: "Available for payout", value: amount, tone: "success" },
      { kind: "button", href: `${APP_URL}/admin/affiliate`, label: "Open payouts tab" },
    ],
  };
}

export interface AdminNewSignupData {
  userId: string;
  name: string | null;
  email: string;
  method: "email" | "google";
  referralCode?: string;
  /** Pre-formatted by the caller, like the security alerts' `time`. */
  signedUpAt: string;
}

export function newSignup(d: AdminNewSignupData): EmailDocument {
  const who = d.name || d.email;
  const method = d.method === "google" ? "Google" : "Email & password";
  return {
    subject: `New signup: ${who}`,
    preheader: `${d.email} just created a ${PRODUCT_NAME} account (${method}).`,
    blocks: [
      { kind: "heading", text: "New signup" },
      {
        kind: "kv",
        rows: [
          { label: "Name", value: d.name || "—" },
          { label: "Email", value: d.email },
          { label: "Signed up with", value: method },
          ...(d.referralCode ? [{ label: "Referral code", value: d.referralCode }] : []),
          { label: "When", value: d.signedUpAt },
        ],
      },
      { kind: "button", href: `${APP_URL}/admin/users/${encodeURIComponent(d.userId)}`, label: "Open in admin" },
    ],
  };
}
