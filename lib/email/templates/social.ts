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

/**
 * A scheduled report has finished building.
 *
 * The link is the app's own download route, not a presigned S3 URL: presigned
 * links expire in minutes and this email may be read hours later, and a URL
 * that grants the bearer access to a private analytics PDF should not be
 * sitting in an inbox at all. The route re-checks ownership on click.
 */
export function socialReportReady(p: {
  name: string;
  reportName: string;
  period: string;
  downloadUrl: string;
}): EmailDocument {
  return {
    subject: `Your ${p.reportName} is ready`,
    preheader: `The ${p.period} report you scheduled has finished building.`,
    blocks: [
      { kind: "heading", text: "Your report is ready" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, the ${p.period} report you scheduled — ${p.reportName} — has finished building.`,
      },
      { kind: "button", href: p.downloadUrl, label: "Open the report", tone: "accent" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "You're getting this because you set this report to run on a schedule. Turn it off in Social Tracker → Reports.",
      },
    ],
  };
}
