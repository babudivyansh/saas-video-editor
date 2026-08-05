// Credit balance email. Opt-out-able: these are nudges about usage, not
// receipts, so each carries an unsubscribe link and a notification category.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { formatDateShort, greet, plural } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";

const DASHBOARD_URL = `${APP_URL}/dashboard`;
const PRICING_URL = `${APP_URL}/pricing`;

export function creditsRefilled(p: {
  name: string;
  creditsAdded: number;
  newBalance: number;
}): EmailDocument {
  return {
    subject: `Your ${p.creditsAdded} ${PRODUCT_NAME} credits have been refreshed`,
    preheader: `Your monthly refill landed. Balance is now ${p.newBalance} credits.`,
    blocks: [
      { kind: "heading", text: `Your ${p.creditsAdded} credits have been refreshed` },
      { kind: "paragraph", text: `Hi ${greet(p.name)}, your monthly credit refill is here. Time to create.` },
      {
        kind: "hero",
        label: "Current balance",
        value: String(p.newBalance),
        caption: plural(p.newBalance, "credit"),
        tone: "brand",
      },
      { kind: "button", href: DASHBOARD_URL, label: "Start creating" },
    ],
  };
}

export function lowCredits(p: {
  name: string;
  creditsLeft: number;
  estimatedVideos: number;
}): EmailDocument {
  return {
    // Plain string, never HTML — the old subject line shipped a literal
    // "&apos;" to inboxes because it was built from the same markup soup as the
    // body. Subjects are plain text in this system, so that class of bug is gone.
    subject: `You're running low — ${p.creditsLeft} credits left`,
    preheader: `About ${p.estimatedVideos} more ${plural(p.estimatedVideos, "video")} at your current usage.`,
    blocks: [
      { kind: "heading", text: "You're running low on credits" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, you've been productive. You have
          <strong>${p.creditsLeft} ${plural(p.creditsLeft, "credit")}</strong> left — enough for about
          <strong>${p.estimatedVideos} more ${plural(p.estimatedVideos, "video")}</strong>.`,
      },
      {
        kind: "hero",
        label: "Credits left",
        value: String(p.creditsLeft),
        tone: "warning",
      },
      {
        kind: "callout",
        tone: "warning",
        title: "Tip",
        body: "Preview your video before rendering — it doesn't cost a credit and catches most re-renders.",
      },
      { kind: "button", href: PRICING_URL, label: "Top up credits", tone: "warning" },
    ],
  };
}

export function zeroCredits(p: { name: string }): EmailDocument {
  return {
    subject: `You've used all your credits — here's how to get more`,
    preheader: "Top up and get back to creating in under a minute.",
    blocks: [
      { kind: "heading", text: "You've used all your credits" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, you tried to create something but ran out of credits. Here are the two quickest ways back:`,
      },
      {
        kind: "cards",
        cards: [
          { title: "Starter pack", subtitle: "+100 credits, one-off", tone: "brand" },
          { title: "Pro plan", subtitle: "500 credits every month", tone: "success" },
        ],
      },
      { kind: "button", href: PRICING_URL, label: "Get more credits" },
    ],
  };
}

export function unusedCredits(p: {
  name: string;
  creditsLeft: number;
  nextRefillAt: Date;
}): EmailDocument {
  return {
    subject: `${greet(p.name)}, you have ${p.creditsLeft} credits sitting unused this month`,
    preheader: `They refresh on ${formatDateShort(p.nextRefillAt)} — unused credits don't roll over.`,
    blocks: [
      { kind: "heading", text: `You have ${p.creditsLeft} credits sitting unused` },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, your credits refresh on
          <strong>${formatDateShort(p.nextRefillAt)}</strong>. Don't let this month's go to waste.`,
      },
      {
        kind: "list",
        title: `Quick ideas for your ${p.creditsLeft} credits`,
        marker: "bullet",
        items: [
          "Create a YouTube Short from a script",
          "Generate an AI voiceover for your next video",
          "Auto-clip a long video into viral shorts",
        ],
      },
      { kind: "button", href: DASHBOARD_URL, label: "Use my credits" },
    ],
  };
}

export function autoTopupPrompt(p: {
  name: string;
  balance: number;
  packName: string;
  checkoutUrl: string;
}): EmailDocument {
  return {
    subject: `You're low on ${PRODUCT_NAME} credits — top up in one click`,
    preheader: `Balance is ${p.balance}. One tap tops you up with ${p.packName}.`,
    blocks: [
      { kind: "heading", text: "You're running low on credits" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, your balance just dropped to
          <strong>${p.balance} ${plural(p.balance, "credit")}</strong>. You've turned on auto top-up — one tap below
          adds ${p.packName} so you're never blocked mid-render.`,
      },
      { kind: "button", href: p.checkoutUrl, label: "Top up now" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "You can turn off auto top-up any time from Billing settings.",
      },
    ],
  };
}
