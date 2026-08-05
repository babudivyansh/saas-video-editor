// Social Tracker weekly digest.

import type { EmailDocument } from "../layout";
import { html, type SafeHtml } from "../html";
import { formatCompact, greet } from "../format";
import { APP_URL, COLOR } from "../tokens";

export interface SocialDigestAccount {
  platform: string;
  name: string;
  followers: number | null;
  followerDelta: number | null;
  postsThisWeek: number;
}

function delta(value: number | null): SafeHtml {
  if (value === null) return html`<span style="color:${COLOR.faint};">—</span>`;
  if (value >= 0) {
    return html`<span style="color:${COLOR.success};font-weight:700;">+${formatCompact(value)}</span>`;
  }
  return html`<span style="color:${COLOR.danger};font-weight:700;">−${formatCompact(Math.abs(value))}</span>`;
}

export function socialDigest(p: { name: string; accounts: SocialDigestAccount[] }): EmailDocument {
  return {
    subject: "Your week on social",
    preheader: `How your ${p.accounts.length} connected ${p.accounts.length === 1 ? "account" : "accounts"} did over the last 7 days.`,
    blocks: [
      { kind: "heading", text: "Your week on social" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, here's how your connected accounts did over the last seven days.`,
      },
      {
        kind: "table",
        head: ["Account", "Followers", "7d", "Posts"],
        align: ["left", "right", "right", "right"],
        rows: p.accounts.map((a) => [
          // Platform and display name both come from the provider — escaped here,
          // interpolated raw before.
          html`<strong>${a.platform}</strong> · ${a.name}`,
          a.followers === null ? "—" : formatCompact(a.followers),
          delta(a.followerDelta),
          String(a.postsThisWeek),
        ]),
      },
      {
        kind: "button",
        href: `${APP_URL}/dashboard/social-tracker`,
        label: "Open Social Tracker",
      },
    ],
  };
}
