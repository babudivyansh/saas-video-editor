// Admin-authored feature-release / newsletter broadcasts (FeatureAnnouncement,
// app/api/cron/feature-announcements). One build function, registered twice in
// registry.ts under two different categories/ids — the content is identical
// regardless of audience, only the opt-out gate and unsubscribe link differ.

import type { EmailDocument } from "../layout";
import { greet } from "../format";

export function featureAnnouncement(p: {
  name: string;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}): EmailDocument {
  return {
    subject: p.title,
    preheader: p.body.length > 140 ? `${p.body.slice(0, 137)}...` : p.body,
    blocks: [
      { kind: "heading", text: p.title },
      { kind: "paragraph", text: `Hi ${greet(p.name)},` },
      { kind: "paragraph", text: p.body },
      ...(p.ctaUrl && p.ctaLabel ? [{ kind: "button" as const, href: p.ctaUrl, label: p.ctaLabel }] : []),
    ],
  };
}
