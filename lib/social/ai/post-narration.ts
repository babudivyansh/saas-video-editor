// One-line narration per post ("this outperformed your median reel, mostly on
// shares"), batched ten to a call — one model request and one charge per ten
// posts instead of per post.
//
// The one thing a model can invent here that would be silently wrong is a post
// id: a narration attached to the wrong post looks perfectly plausible. So ids
// are validated against the batch we sent and unknown ones are dropped.

import { z } from "zod";
import { buildPrompt, generateStructured } from "./client";
import type { Factsheet } from "./factsheets";
import { postNarrationsSchema, type PostNarrations } from "./schemas";

const RESPONSE_SCHEMA = z.toJSONSchema(postNarrationsSchema);

/** One charge covers this many posts. */
export const NARRATION_BATCH_SIZE = 10;

export function batchPosts<T>(posts: T[], size = NARRATION_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < posts.length; i += size) batches.push(posts.slice(i, i + size));
  return batches;
}

export async function generatePostNarrations(facts: Factsheet, postIds: string[]): Promise<PostNarrations> {
  const result = await generateStructured({
    schema: postNarrationsSchema,
    responseSchema: RESPONSE_SCHEMA,
    prompt: buildPrompt({
      role: "You are a social media analyst annotating individual posts.",
      task: [
        `Write one narration for each of these ${postIds.length} posts, echoing its postId exactly: ${postIds.join(", ")}.`,
        'Each needs a "verdict" of outperformed, typical or underperformed — read it off the score and percentiles given, do not judge the content yourself — and a two-sentence narration naming which component drove it.',
      ].join("\n"),
      facts,
    }),
  });

  const allowed = new Set(postIds);
  const seen = new Set<string>();
  return {
    narrations: result.narrations.filter((n) => {
      if (!allowed.has(n.postId) || seen.has(n.postId)) return false;
      seen.add(n.postId);
      return true;
    }),
  };
}
