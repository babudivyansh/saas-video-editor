"use client";
import { StackedBars, type SeriesDef } from "../../dashboard/charts";
import { BRAND, PALETTE } from "@/app/components/dashboard/palette";
import { TRIAL_OUTCOME_LABEL } from "@/lib/billing/billing-status-labels";
import type { TrialWeek } from "./shared";

// Outcome colours: green for the good result, red for the revoked mandate the
// admin asked to watch, grey for "nothing happened".
const SERIES: SeriesDef[] = [
  { key: "converted", name: TRIAL_OUTCOME_LABEL.converted, color: BRAND },
  { key: "active", name: TRIAL_OUTCOME_LABEL.active, color: PALETTE[0] },
  { key: "cancelled_in_app", name: TRIAL_OUTCOME_LABEL.cancelled_in_app, color: PALETTE[2] },
  { key: "mandate_revoked", name: TRIAL_OUTCOME_LABEL.mandate_revoked, color: PALETTE[4] },
  { key: "payment_failed", name: TRIAL_OUTCOME_LABEL.payment_failed, color: PALETTE[3] },
  { key: "ended", name: TRIAL_OUTCOME_LABEL.ended, color: "var(--fg-subtle)" },
];

/** Trials started per week (last 12 weeks), split by what became of them. */
export function TrialsChart({ weeks }: { weeks: TrialWeek[] }) {
  const started = weeks.reduce((n, w) => n + SERIES.reduce((m, s) => m + Number(w[s.key as keyof TrialWeek]), 0), 0);
  const data = weeks.map((w) => ({ ...w, date: w.week }));
  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-sm font-bold text-fg">Trials started per week</h2>
        <p className="text-xs text-fg-subtle">Last 12 weeks · {started.toLocaleString("en-IN")} started · coloured by outcome so far</p>
      </div>
      <StackedBars data={data} series={SERIES} height={200} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-3" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
