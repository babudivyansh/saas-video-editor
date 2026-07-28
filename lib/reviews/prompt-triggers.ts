// Smart review-prompt trigger evaluation, shared by the real-time
// prompt-check route (called from a success/completion screen) and the
// calendar-driven cron (app/api/cron/review-prompts). Both paths update the
// same ReviewPromptState row via recordPrompt/recordDismiss so the
// throttle/lifetime-cap is shared across every trigger type.

import { prisma } from "@/lib/prisma";
import { getReviewSettings } from "@/lib/reviews/settings";

// tool_generation_complete replaces the old, never-wired usage_milestone —
// same underlying gate (10 completed generations), fired from every AI-tool
// completion screen rather than a single site. billing_success covers plan
// upgrades/renewals/credit purchases (client-side checkout success + a
// webhook fallback for server-driven renewals). A non-authoritative
// featureHint (see recordPrompt) rides alongside for analytics/modal
// prefill only — never for eligibility.
export type PromptTrigger = "export_complete" | "autoclips_milestone" | "tool_generation_complete" | "billing_success" | "days_active";

export interface PromptCheckResult {
  shouldPrompt: boolean;
  trigger?: PromptTrigger;
}

// Lowest of each milestone's thresholds — crossing any of these once is
// enough to qualify; the shared cooldown/lifetime-cap (not per-threshold
// tracking) is what prevents repeat prompts from then on.
const AUTOCLIPS_MILESTONE_THRESHOLD = 5;
const TOOL_GENERATION_MILESTONE_THRESHOLD = 10;

async function isThrottled(userId: string): Promise<boolean> {
  const settings = await getReviewSettings();
  const state = await prisma.reviewPromptState.findUnique({ where: { userId } });
  if (!state) return false;
  if (state.permanentlyDismissedAt) return true;
  if (state.promptCount >= settings.promptMaxLifetime) return true;
  if (state.lastPromptedAt) {
    const daysSince = (Date.now() - state.lastPromptedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < settings.promptThrottleDays) return true;
  }
  return false;
}

export async function evaluatePromptTrigger(userId: string, trigger: PromptTrigger): Promise<PromptCheckResult> {
  const existingReview = await prisma.review.findUnique({ where: { userId }, select: { id: true } });
  if (existingReview) return { shouldPrompt: false };

  if (await isThrottled(userId)) return { shouldPrompt: false };

  const qualifies = await triggerQualifies(userId, trigger);
  if (!qualifies) return { shouldPrompt: false };

  return { shouldPrompt: true, trigger };
}

async function triggerQualifies(userId: string, trigger: PromptTrigger): Promise<boolean> {
  switch (trigger) {
    case "export_complete":
      // Called right after the caller's own successful export — trusted.
      return true;
    case "autoclips_milestone": {
      const count = await prisma.clip.count({ where: { project: { userId }, status: "ready" } });
      return count >= AUTOCLIPS_MILESTONE_THRESHOLD;
    }
    case "tool_generation_complete": {
      const count = await prisma.generation.count({ where: { userId, status: "completed" } });
      return count >= TOOL_GENERATION_MILESTONE_THRESHOLD;
    }
    case "billing_success":
      // Called right after the caller's own successful checkout/webhook
      // fulfillment — trusted, same shape as export_complete.
      return true;
    case "days_active":
      // Only ever fired from the cron, which has already applied its own
      // day-threshold + recent-login filter before calling this.
      return true;
  }
}

// Records a shown prompt in three places: the throttle/cooldown state
// (ReviewPromptState, unchanged shape), an append-only funnel-analytics
// event (ReviewPromptEvent — distinct because funnel analytics need
// per-shown-event dismiss/convert facts an aggregate counter can't give),
// and — for every trigger except days_active, which already gets its own
// immediate nudge email from the cron — a 3-stage email-drip sequence
// (ReviewEmailSequence). The upsert's `update: {}` is deliberately a no-op:
// a user gets exactly one drip sequence per lifetime, anchored to whichever
// trigger fired first.
export async function recordPrompt(userId: string, trigger: PromptTrigger, featureHint?: string): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.reviewPromptState.upsert({
      where: { userId },
      create: { userId, lastPromptedAt: now, promptCount: 1, lastTrigger: trigger },
      update: { lastPromptedAt: now, promptCount: { increment: 1 }, lastTrigger: trigger },
    }),
    prisma.reviewPromptEvent.create({
      data: { userId, trigger, featureHint, shownAt: now },
    }),
    trigger === "days_active"
      ? Promise.resolve()
      : prisma.reviewEmailSequence.upsert({
          where: { userId },
          create: { userId, triggerEventAt: now, sourceTrigger: trigger },
          update: {},
        }),
  ]);
}

export async function recordDismiss(userId: string, permanent: boolean): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.reviewPromptState.upsert({
      where: { userId },
      create: {
        userId,
        dismissedAt: now,
        dismissCount: 1,
        ...(permanent ? { permanentlyDismissedAt: now } : {}),
      },
      update: {
        dismissedAt: now,
        dismissCount: { increment: 1 },
        ...(permanent ? { permanentlyDismissedAt: now } : {}),
      },
    }),
    prisma.reviewPromptEvent.updateMany({
      where: { userId, dismissedAt: null, convertedAt: null },
      data: { dismissedAt: now, permanentDismiss: permanent },
    }),
  ]);
}
