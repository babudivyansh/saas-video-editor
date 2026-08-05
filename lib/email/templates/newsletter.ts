// Newsletter double opt-in.
//
// Deviates from the house (to, name, …) shape because a newsletter subscriber is
// anonymous — we have an address and nothing else, so there is no name to greet.

import type { EmailDocument } from "../layout";
import { PRODUCT_NAME } from "../tokens";

export function newsletterConfirm(p: { confirmUrl: string }): EmailDocument {
  return {
    subject: `Confirm your ${PRODUCT_NAME} newsletter subscription`,
    preheader: "One tap to confirm. Nothing is sent until you do.",
    blocks: [
      { kind: "heading", text: "Confirm your subscription" },
      {
        kind: "paragraph",
        text: `Tap below to start receiving the ${PRODUCT_NAME} creator playbook — practical short-form video tactics, roughly twice a month.`,
      },
      { kind: "button", href: p.confirmUrl, label: "Confirm subscription" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "If you didn't request this, ignore this email — nothing happens without that tap.",
      },
    ],
  };
}
