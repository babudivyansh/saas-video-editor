// Affiliate programme email.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { formatDate, formatRupees, greet } from "../format";
import { APP_URL } from "../tokens";

const AFFILIATE_URL = `${APP_URL}/affiliate-program`;

export function referralSignup(p: {
  affiliateName: string;
  referredName: string;
  totalReferrals: number;
}): EmailDocument {
  return {
    // p.referredName is another user's chosen display name — attacker-controlled
    // text. It was interpolated raw into the old heading and subject.
    subject: `${p.referredName} just joined using your referral link`,
    preheader: `That's ${p.totalReferrals} referrals so far. You earn when they first purchase.`,
    blocks: [
      { kind: "heading", text: `${p.referredName} just joined using your link` },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.affiliateName)}, good news — <strong>${p.referredName}</strong> signed up using your
          referral link. You'll earn a commission when they make their first purchase.`,
      },
      { kind: "hero", label: "Total referrals", value: String(p.totalReferrals), tone: "success" },
      {
        kind: "paragraph",
        text: "Keep sharing your link to earn more commissions.",
      },
      { kind: "button", href: AFFILIATE_URL, label: "View affiliate dashboard", tone: "success" },
    ],
  };
}

export function commissionEarned(p: {
  affiliateName: string;
  commission: number;
  baseAmount: number;
  totalEarned: number;
  availableAt: Date;
}): EmailDocument {
  const commission = formatRupees(p.commission);
  return {
    subject: `You earned ${commission} — commission confirmed`,
    preheader: `Available for payout from ${formatDate(p.availableAt)}.`,
    blocks: [
      { kind: "heading", text: `You earned ${commission} in commission` },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.affiliateName)}, one of your referrals just made a purchase. Here's the breakdown:`,
      },
      {
        kind: "kv",
        title: "Commission breakdown",
        rows: [
          { label: "Purchase amount", value: formatRupees(p.baseAmount) },
          { label: "Commission earned", value: commission, tone: "success" },
          { label: "Available from", value: formatDate(p.availableAt) },
          { label: "Total earned (all time)", value: formatRupees(p.totalEarned) },
        ],
      },
      {
        kind: "callout",
        tone: "neutral",
        body: "Commission is held for 30 days as fraud protection, then becomes available for payout.",
      },
      { kind: "button", href: AFFILIATE_URL, label: "View earnings", tone: "success" },
    ],
  };
}

export function commissionAvailable(p: { affiliateName: string; amount: number }): EmailDocument {
  const amount = formatRupees(p.amount);
  return {
    subject: `Your ${amount} commission is ready for payout`,
    preheader: "Your 30-day hold period is over. Request a payout whenever you're ready.",
    blocks: [
      { kind: "heading", text: "Your commission is ready for payout" },
      { kind: "paragraph", text: `Hi ${greet(p.affiliateName)}, your 30-day hold period is over.` },
      { kind: "hero", label: "Available for withdrawal", value: amount, tone: "success" },
      { kind: "button", href: AFFILIATE_URL, label: "Request payout", tone: "success" },
    ],
  };
}
