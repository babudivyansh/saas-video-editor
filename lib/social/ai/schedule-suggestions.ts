// When to post next.
//
// The slots themselves are computed by lib/social/metrics/timing.ts; the model
// only picks among them and says why. Its day/block vocabulary is constrained by
// the schema to exactly the buckets the engine produces, so it cannot answer
// "Tuesday around 5:30pm" — a precision the data does not support.

import { z } from "zod";
import { buildPrompt, generateStructured } from "./client";
import type { Factsheet } from "./factsheets";
import { scheduleSuggestionsSchema, type ScheduleSuggestions } from "./schemas";

const RESPONSE_SCHEMA = z.toJSONSchema(scheduleSuggestionsSchema);

export async function generateScheduleSuggestions(facts: Factsheet): Promise<ScheduleSuggestions> {
  return generateStructured({
    schema: scheduleSuggestionsSchema,
    responseSchema: RESPONSE_SCHEMA,
    prompt: buildPrompt({
      role: "You are a social media scheduler recommending when this account should publish.",
      task: [
        "Pick 2-4 slots from the ranked slots above — do not invent a day or time that is not listed. For each, say why in terms of the engagement rates and sample sizes given.",
        'Then write a "summary" of the cadence you would recommend.',
        "If the slots above are thin or missing, say the account needs to publish more before timing advice is meaningful.",
      ].join("\n"),
      facts,
    }),
  });
}
