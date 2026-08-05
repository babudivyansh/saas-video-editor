// Review moderation outcomes, the review prompt, and the 3-step drip.
//
// The drip is the only tracked mail in the product. Tracking URLs are built by
// the caller and passed in, so this file stays free of lib/env (signTrackToken
// needs JWT_SECRET) and remains previewable and unit-testable.

import type { EmailDocument } from "../layout";
import { greet } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";

export function reviewPublished(p: { name: string; reviewUrl: string }): EmailDocument {
  return {
    subject: `Your ${PRODUCT_NAME} review is now live`,
    preheader: "Thanks for sharing — other creators can see it now.",
    blocks: [
      { kind: "heading", text: "Your review is live" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, thanks for sharing your experience — your review of ${PRODUCT_NAME} is published for other creators to see.`,
      },
      { kind: "button", href: p.reviewUrl, label: "View your review", tone: "violet" },
    ],
  };
}

export function reviewRejected(p: { name: string; reason?: string }): EmailDocument {
  return {
    subject: `An update on your ${PRODUCT_NAME} review`,
    preheader: "Your submission wasn't approved — you can edit and resubmit.",
    blocks: [
      { kind: "heading", text: "Your review wasn't approved" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, our team looked at your recent ${PRODUCT_NAME} submission and it wasn't approved for publishing.`,
      },
      // The reason is moderator-written free text — escaped by the block
      // renderer, where it used to be interpolated raw.
      ...(p.reason
        ? ([{ kind: "callout", tone: "neutral", title: "Reason", body: p.reason }] as const)
        : []),
      { kind: "paragraph", text: "You're welcome to update and resubmit your review at any time." },
      { kind: "button", href: `${APP_URL}/dashboard?editReview=1`, label: "Edit and resubmit", tone: "violet" },
    ],
  };
}

export function reviewReply(p: { name: string; reviewUrl: string }): EmailDocument {
  return {
    subject: `${PRODUCT_NAME} replied to your review`,
    preheader: "Our team posted a public response to your review.",
    blocks: [
      { kind: "heading", text: `${PRODUCT_NAME} replied to your review` },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, our team just posted a public response to the review you left.`,
      },
      { kind: "button", href: p.reviewUrl, label: "See the response", tone: "violet" },
    ],
  };
}

export function reviewPrompt(p: { name: string; reviewUrl: string }): EmailDocument {
  return {
    subject: `Got a minute to review ${PRODUCT_NAME}?`,
    preheader: "It takes about a minute and helps other creators decide.",
    blocks: [
      { kind: "heading", text: `Got a minute to review ${PRODUCT_NAME}?` },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, you've been creating with ${PRODUCT_NAME} for a while — mind sharing what you think? It helps other creators decide, and helps us keep improving.`,
      },
      { kind: "button", href: p.reviewUrl, label: "Write a review", tone: "violet" },
      { kind: "paragraph", tone: "fine", text: "Takes about a minute." },
    ],
  };
}

/** Shared shape for the three drip stages. `ctaUrl` is already tracked. */
interface DripProps {
  name: string;
  ctaUrl: string;
  pixelUrl: string;
}

export function reviewDrip1(p: DripProps): EmailDocument {
  return {
    subject: `How's ${PRODUCT_NAME} working out for you?`,
    preheader: "A quick review helps other creators decide.",
    blocks: [
      { kind: "heading", text: `Thanks for creating with ${PRODUCT_NAME}` },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, thanks for using ${PRODUCT_NAME} recently. We'd love to know how it's going — a quick review helps other creators decide, and helps us keep improving.`,
      },
      { kind: "button", href: p.ctaUrl, label: "Leave a review", tone: "violet" },
      { kind: "paragraph", tone: "fine", text: "Takes about a minute." },
      { kind: "pixel", src: p.pixelUrl },
    ],
  };
}

export function reviewDrip2(p: DripProps): EmailDocument {
  return {
    subject: "Your feedback shapes what we build next",
    preheader: "A gentle nudge — your review genuinely changes our roadmap.",
    blocks: [
      { kind: "heading", text: "A quick favour?" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, just a gentle nudge — your feedback genuinely shapes what we build next, and it helps other creators trust ${PRODUCT_NAME} enough to try it.`,
      },
      { kind: "button", href: p.ctaUrl, label: "Share your thoughts", tone: "violet" },
      { kind: "paragraph", tone: "fine", text: "Takes about a minute." },
      { kind: "pixel", src: p.pixelUrl },
    ],
  };
}

export function reviewDrip3(p: DripProps): EmailDocument {
  return {
    subject: `One last ask — thanks for creating with ${PRODUCT_NAME}`,
    preheader: "The final reminder. You won't hear about this again.",
    blocks: [
      { kind: "heading", text: "One last ask" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, this is the last time we'll ask — if you have a minute to leave a review we'd really appreciate it. Either way, thank you for creating with ${PRODUCT_NAME}.`,
      },
      { kind: "button", href: p.ctaUrl, label: "Leave a review", tone: "violet" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "This is the final reminder — you won't hear about this again.",
      },
      { kind: "pixel", src: p.pixelUrl },
    ],
  };
}
