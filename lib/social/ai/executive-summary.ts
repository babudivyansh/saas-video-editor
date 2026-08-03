// The executive summary: weekly (auto, behind the existing freshness gate) and
// monthly / quarterly / annual (on demand, credit-gated).
//
// The period only changes the framing, never the arithmetic — the caller has
// already computed the window and handed over a factsheet for it.

import { z } from "zod";
import type { Period } from "../metrics/dates";
import { buildPrompt, generateStructured } from "./client";
import type { Factsheet } from "./factsheets";
import { executiveSummarySchema, type ExecutiveSummary } from "./schemas";

const RESPONSE_SCHEMA = z.toJSONSchema(executiveSummarySchema);

const FRAMING: Record<Period, string> = {
  weekly: "Write for a creator reviewing their week. Be concrete and near-term.",
  monthly: "Write for a creator reviewing their month. Favour trends over individual posts.",
  quarterly:
    "Write for someone reviewing a quarter. Talk about direction and what compounded, not day-to-day noise.",
  annual:
    "Write for an annual review. Talk about the shape of the year and what structurally changed; ignore single posts unless they moved the year.",
};

export async function generateExecutiveSummary(facts: Factsheet, period: Period): Promise<ExecutiveSummary> {
  return generateStructured({
    schema: executiveSummarySchema,
    responseSchema: RESPONSE_SCHEMA,
    prompt: buildPrompt({
      role: "You are a social media growth strategist writing an executive summary.",
      task: [
        FRAMING[period],
        "",
        'Produce: "summary" (2-4 sentences on how the period went, referencing the figures above);',
        '"wins" (0-5 short bullets naming what worked — an empty array if nothing stands out, do not manufacture one);',
        '"concerns" (0-5 short bullets on what got worse or is at risk);',
        '"recommendations" (1-5 items, each with a title, a rationale grounded in the facts above, the metric it is meant to move (or null), and an effort of low, medium or high).',
      ].join("\n"),
      facts,
    }),
  });
}
