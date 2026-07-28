// Synchronous heuristic spam scorer for review submissions/edits — no
// external API, runs inline on the request path. Duplicate-body detection is
// a separate async helper (needs a DB round trip) so computeSpamScore itself
// stays a pure, easily-testable function.

import { prisma } from "@/lib/prisma";

export interface SpamCheckContext {
  rating: number;
  accountAgeHours: number;
}

export interface SpamCheckResult {
  score: number;
  flags: string[];
}

const URL_REGEX = /https?:\/\/\S+/gi;

export function computeSpamScore(body: string, context: SpamCheckContext, isDuplicate: boolean): SpamCheckResult {
  let score = 0;
  const flags: string[] = [];

  if (isDuplicate) {
    score += 40;
    flags.push("duplicate_body");
  }

  const trimmed = body.trim();
  if (trimmed.length < 20) {
    score += 20;
    flags.push("too_short");
  }

  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0) {
    const upper = letters.replace(/[^A-Z]/g, "");
    if (upper.length / letters.length > 0.6) {
      score += 10;
      flags.push("all_caps");
    }
  }

  const urlMatches = trimmed.match(URL_REGEX) ?? [];
  if (urlMatches.length >= 2) {
    score += 25;
    flags.push("multiple_urls");
  }

  if ((context.rating === 1 || context.rating === 5) && context.accountAgeHours < 24) {
    score += 15;
    flags.push("new_account_extreme_rating");
  }

  return { score: Math.min(score, 100), flags };
}

/** Exact-text duplicate against another user's review — cheap, no hash column needed at this scale. */
export async function isDuplicateReviewBody(body: string, excludeUserId: string): Promise<boolean> {
  const existing = await prisma.review.findFirst({
    where: { body, userId: { not: excludeUserId } },
    select: { id: true },
  });
  return !!existing;
}
