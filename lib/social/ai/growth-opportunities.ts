// Growth opportunities: what to do about the forecast, the goals, and the gap
// to the competitors the user chose to track.

import { z } from "zod";
import { buildPrompt, generateStructured } from "./client";
import type { Factsheet } from "./factsheets";
import { growthOpportunitiesSchema, type GrowthOpportunities } from "./schemas";

const RESPONSE_SCHEMA = z.toJSONSchema(growthOpportunitiesSchema);

export async function generateGrowthOpportunities(facts: Factsheet): Promise<GrowthOpportunities> {
  return generateStructured({
    schema: growthOpportunitiesSchema,
    responseSchema: RESPONSE_SCHEMA,
    prompt: buildPrompt({
      role: "You are a growth advisor reviewing an account's trajectory, goals and competitive position.",
      task: [
        "Give 3-6 opportunities, highest leverage first. Each needs a title, a rationale citing the forecast, goals or competitor figures above, the metric it targets (or null), a horizon of now, this-month or this-quarter, and an effort of low, medium or high.",
        "Where the forecast is marked weak, or a competitor figure is unknown, do not build an opportunity on it.",
      ].join("\n"),
      facts,
    }),
  });
}
