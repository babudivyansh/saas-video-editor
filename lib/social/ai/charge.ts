// Credit mechanics for the social AI routes.
//
// Copied in behaviour from app/api/social/insights/route.ts — charge, run, mark
// completed, and on ANY failure refund and say so — but written once instead of
// once per route. Five hand-copied refund paths is five chances to forget the
// refund, and a user charged for a generation they never received is the worst
// bug this feature could ship.

import { chargeCredits, markGenerationStatus, refundCredits } from "@/lib/credits";
import { getToolConfig } from "@/lib/tool-config";
import { logger } from "@/lib/logger";
import { HttpError } from "../api";

export interface ChargedRunOptions {
  userId: string;
  toolSlug: string;
  /** Must be stable for a retry of the SAME logical request — see the callers. */
  idempotencyKey: string;
  /** Human description stored on the generation log row. */
  description: string;
}

/**
 * Run `work` against one credit charge.
 *
 * A zero-cost tool still goes through here: the generation log is what makes
 * usage auditable, and free today is not free forever.
 */
export async function runCharged<T>(opts: ChargedRunOptions, work: () => Promise<T>): Promise<T> {
  const config = await getToolConfig(opts.toolSlug);
  if (!config.enabled) {
    throw new HttpError(503, "This feature is temporarily disabled.", "tool_disabled");
  }

  const charge = await chargeCredits({
    userId: opts.userId,
    toolSlug: opts.toolSlug,
    amount: config.creditCost,
    idempotencyKey: opts.idempotencyKey,
    log: { generationType: "utility", prompt: opts.description },
  });

  if (!charge.ok) {
    if (charge.reason === "insufficient_credits") {
      throw new HttpError(402, "Not enough credits.", "insufficient_credits");
    }
    throw new HttpError(503, "This feature is temporarily disabled.", "tool_disabled");
  }

  try {
    const result = await work();
    if (charge.generationId) await markGenerationStatus(charge.generationId, "completed");
    return result;
  } catch (e) {
    logger.error("social-ai", `${opts.toolSlug} failed for ${opts.userId}`, e);
    await refundCredits({ userId: opts.userId, amount: config.creditCost, generationId: charge.generationId });
    // 502 and the explicit "not charged": the alternative is a user who cannot
    // tell a failed generation from a silent one.
    throw new HttpError(502, "Generation failed — you were not charged.", "generation_failed");
  }
}
