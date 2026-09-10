// Signals worth interrupting for: milestones, follower drops, engagement swings.
//
// Rendered from `code` + `params`, never from the engine's English `message`
// field — which is deprecated for exactly this reason. That kept the wording
// out of lib/social/metrics; it now lives in the SocialAlerts message
// namespace rather than in this file.
//
// It was hardcoded English in a thirteen-locale app until i18n/request.ts
// gained an English fallback. Before that, adding a namespace meant editing all
// thirteen files in one commit or throwing in twelve locales — which is exactly
// the friction that kept these strings here.

import { getTranslations } from "next-intl/server";
import type { AccountAlert, AlertCode } from "@/lib/social/metrics";

export interface AlertStripProps {
  alerts: Array<AccountAlert & { accountLabel?: string }>;
}

const TONE = {
  milestone: "border-tint-emerald-border bg-tint-emerald text-fg",
  spike: "border-tint-blue-border bg-tint-blue text-fg",
  drop: "border-tint-amber-border bg-tint-amber text-warning",
} as const;

const ICON = { milestone: "★", spike: "▲", drop: "▼" } as const;

const compact = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const pct = (n: number) => `${Math.abs(n).toFixed(0)}%`;

/**
 * Numbers are formatted here and passed in already-rendered, rather than as
 * ICU number arguments. Compact notation and the sign-stripped percentage are
 * presentation decisions this component already owns, and duplicating them into
 * thirteen message files would be thirteen chances to disagree.
 */
const PARAMS: Record<AlertCode, (p: Record<string, number>) => Record<string, string>> = {
  followerMilestone: (p) => ({ milestone: compact(p.milestone ?? 0) }),
  followerDrop: (p) => ({ lost: compact(p.lost ?? 0), pct: pct(p.pct ?? 0) }),
  engagementDrop: (p) => ({ pct: pct((p.changePct ?? 0) * 100) }),
  engagementSpike: (p) => ({ pct: pct((p.changePct ?? 0) * 100) }),
};

export async function AlertStrip({ alerts }: AlertStripProps) {
  if (alerts.length === 0) return null;

  // getTranslations, not useTranslations: this is a Server Component, and it
  // should stay one — it renders from data the page already has and needs no
  // interactivity.
  const t = await getTranslations("SocialAlerts");

  return (
    // role="status", not "alert": these are noteworthy, not urgent, and an
    // assertive live region would interrupt a screen reader mid-sentence every
    // time the page re-rendered.
    <section role="status" aria-label="Recent signals" className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={`${alert.code}-${i}`}
          className={`flex items-start gap-2.5 rounded-[var(--radius-card)] border px-3.5 py-2.5 text-sm ${TONE[alert.kind]}`}
        >
          <span aria-hidden="true" className="mt-0.5 text-xs">
            {ICON[alert.kind]}
          </span>
          <p className="min-w-0">
            {alert.accountLabel && <span className="font-semibold">{alert.accountLabel}: </span>}
            {/* Falls back to the engine's own message if a new code lands here
                before its copy does — a missing string must not blank the row. */}
            {PARAMS[alert.code] ? t(alert.code, PARAMS[alert.code](alert.params)) : alert.message}
          </p>
        </div>
      ))}
    </section>
  );
}
