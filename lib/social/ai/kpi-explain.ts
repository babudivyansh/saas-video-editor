// "Why did this move?" for a single KPI tile.
//
// Free and cached, which forces a discipline the paid generators do not need:
// most KPI movements have a mechanical explanation, and calling a model to say
// "reach fell because you published three fewer posts" is a waste of a request
// and an invitation to embellish. So the deterministic template runs first and
// the model is only asked about movements nothing explains.

import type { Kpi } from "../metrics/kpis";
import type { MetricKey } from "../capabilities";
import { buildPrompt, generateStructured } from "./client";
import { METRIC_LABELS, type Factsheet } from "./factsheets";
import { kpiExplanationSchema, type KpiExplanation } from "./schemas";
import { z } from "zod";

const RESPONSE_SCHEMA = z.toJSONSchema(kpiExplanationSchema);

/** Below this a change is noise and gets the "flat" template, not a narrative. */
export const FLAT_THRESHOLD_PCT = 3;

/** How closely a driver has to track the metric before we claim it is the cause. */
const DRIVER_RATIO_TOLERANCE = 0.35;

export interface KpiExplainInput {
  metric: MetricKey;
  kpi: Kpi;
  /** Candidate drivers, already computed. Order is preference order. */
  drivers: Kpi[];
}

const dir = (pct: number) => (pct >= 0 ? "rose" : "fell");
const abs = (pct: number) => `${Math.abs(pct).toFixed(0)}%`;

/**
 * The template pass. Returns null when nothing here honestly explains the
 * movement — that null is what escalates to the model.
 */
export function deterministicKpiExplanation(input: KpiExplainInput): KpiExplanation | null {
  const { kpi, metric } = input;
  const label = METRIC_LABELS[metric];

  if (kpi.available === "unavailable") {
    return {
      metric,
      headline: `${label} is not reported by this platform.`,
      detail: kpi.reason ?? "This platform's API does not expose this metric, so there is nothing to explain.",
      confidence: "high",
    };
  }

  if (kpi.current === null) {
    return {
      metric,
      headline: `No ${label.toLowerCase()} data has been collected yet.`,
      detail: "Once a sync returns this metric for a full period there will be a comparison to explain.",
      confidence: "high",
    };
  }

  if (kpi.deltaPct === null) {
    return {
      metric,
      headline: `${label} has no previous period to compare against.`,
      detail: "The account has not been connected long enough to compute a change.",
      confidence: "high",
    };
  }

  if (Math.abs(kpi.deltaPct) < FLAT_THRESHOLD_PCT) {
    return {
      metric,
      headline: `${label} held steady.`,
      detail: `It moved ${abs(kpi.deltaPct)} against the previous period, which is within normal week-to-week variation.`,
      confidence: "high",
    };
  }

  // A driver explains the move when it went the same way by a similar amount.
  for (const driver of input.drivers) {
    if (driver.deltaPct === null || driver.current === null) continue;
    if (Math.sign(driver.deltaPct) !== Math.sign(kpi.deltaPct)) continue;
    if (Math.abs(driver.deltaPct) < FLAT_THRESHOLD_PCT) continue;
    const ratio = Math.abs(driver.deltaPct) / Math.abs(kpi.deltaPct);
    if (Math.abs(ratio - 1) > DRIVER_RATIO_TOLERANCE) continue;
    return {
      metric,
      headline: `${label} ${dir(kpi.deltaPct)} ${abs(kpi.deltaPct)} alongside ${METRIC_LABELS[driver.metric].toLowerCase()}.`,
      detail: `${METRIC_LABELS[driver.metric]} ${dir(driver.deltaPct)} ${abs(driver.deltaPct)} over the same window, which accounts for most of the change in ${label.toLowerCase()}.`,
      confidence: "medium",
    };
  }

  return null;
}

/**
 * Cache key for the model pass, built from ROUNDED values.
 *
 * Rounding is the point: an idle dashboard whose numbers wobble by a follower
 * would otherwise re-bill (or at least re-call) on every page load. Two
 * dashboards that a human would read identically share a key.
 */
export function kpiExplainCacheKey(accountId: string, input: KpiExplainInput): string {
  const round = (v: number | null) => (v === null ? "n" : Math.round(v).toString());
  const drivers = input.drivers.map((d) => `${d.metric}=${round(d.deltaPct)}`).join(",");
  return `social:kpi-explain:${accountId}:${input.metric}:${round(input.kpi.deltaPct)}:${drivers}`;
}

export async function explainKpi(facts: Factsheet, metric: MetricKey): Promise<KpiExplanation> {
  const result = await generateStructured({
    schema: kpiExplanationSchema,
    responseSchema: RESPONSE_SCHEMA,
    prompt: buildPrompt({
      role: "You are a social media analyst explaining one number on a dashboard.",
      task: `Explain the most likely reason ${METRIC_LABELS[metric]} moved the way it did. Set "metric" to ${metric}. Give one headline sentence and a short detail paragraph. Set "confidence" to low if the facts do not really explain the movement — say so plainly rather than inventing a cause.`,
      facts,
    }),
    // A tooltip is not worth three round trips.
    maxAttempts: 2,
    timeoutMs: 15_000,
  });
  // The model is told which metric it is explaining; if it answers about a
  // different one the explanation would be attached to the wrong tile.
  if (result.metric !== metric) {
    return { ...result, metric };
  }
  return result;
}
