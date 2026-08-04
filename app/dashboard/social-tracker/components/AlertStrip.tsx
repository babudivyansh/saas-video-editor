// Signals worth interrupting for: milestones, follower drops, engagement swings.
//
// Rendered from `code` + `params`, never from the engine's English `message`
// field — which is deprecated for exactly this reason. Keeping the renderer in
// charge of the wording is what makes translating this possible later without
// touching lib/social/metrics; the strings below are the only thing a
// next-intl namespace would have to absorb.

import type { AccountAlert, AlertCode } from "@/lib/social/metrics";

export interface AlertStripProps {
  alerts: Array<AccountAlert & { accountLabel?: string }>;
}

const TONE = {
  milestone: "border-emerald-200 bg-emerald-50 text-emerald-900",
  spike: "border-violet-200 bg-tint-violet text-ink",
  drop: "border-amber-200 bg-amber-50 text-amber-900",
} as const;

const ICON = { milestone: "★", spike: "▲", drop: "▼" } as const;

const compact = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const pct = (n: number) => `${Math.abs(n).toFixed(0)}%`;

const COPY: Record<AlertCode, (p: Record<string, number>) => string> = {
  followerMilestone: (p) => `Passed ${compact(p.milestone ?? 0)} followers.`,
  followerDrop: (p) => `Lost ${compact(p.lost ?? 0)} followers this week (${pct(p.pct ?? 0)} of your audience).`,
  engagementDrop: (p) => `Engagement rate fell ${pct((p.changePct ?? 0) * 100)} against last week.`,
  engagementSpike: (p) => `Engagement rate rose ${pct((p.changePct ?? 0) * 100)} against last week.`,
};

export function AlertStrip({ alerts }: AlertStripProps) {
  if (alerts.length === 0) return null;

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
            {COPY[alert.code]?.(alert.params) ?? alert.message}
          </p>
        </div>
      ))}
    </section>
  );
}
