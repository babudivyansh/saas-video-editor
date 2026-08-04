// What to make next, from the scores the engine already computed for what has
// been made so far.

import { z } from "zod";
import { buildPrompt, generateStructured } from "./client";
import type { Factsheet } from "./factsheets";
import { contentRecommendationsSchema, type ContentRecommendations } from "./schemas";

const RESPONSE_SCHEMA = z.toJSONSchema(contentRecommendationsSchema);

export async function generateContentRecommendations(facts: Factsheet): Promise<ContentRecommendations> {
  return generateStructured({
    schema: contentRecommendationsSchema,
    responseSchema: RESPONSE_SCHEMA,
    prompt: buildPrompt({
      role: "You are a content strategist advising a creator on what to publish next.",
      task: [
        "Give 3-6 recommendations, strongest first. Each needs a title, a 'why' that cites the specific posts or content types above, the metric it should move (or null when it is not about one metric), and a priority of low, medium or high.",
        "Base every recommendation on the scored posts and content mix above. Where the scores are marked unavailable, say the sample is too small rather than ranking anyway.",
      ].join("\n"),
      facts,
    }),
  });
}
