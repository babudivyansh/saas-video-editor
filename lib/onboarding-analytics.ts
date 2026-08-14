import { logger } from "./logger";
import { prisma } from "./prisma";

// Every distinct onboarding touchpoint across Phases 1-8 — kept as one
// closed union so a new step always has to be added here, not invented
// ad hoc at the call site.
export type OnboardingEvent =
  | "welcome_shown"
  | "welcome_goal_selected"
  | "welcome_preferences_saved"
  | "welcome_skipped"
  | "tour_started"
  | "tour_step_advanced"
  | "tour_completed"
  | "tour_skipped"
  | "hint_dismissed"
  | "quest_completed"
  | "onboarding_restarted"
  // Global Asset Library
  | "asset_uploaded"
  | "asset_upload_failed"
  | "asset_upload_limit_reached"
  | "asset_selected"
  | "asset_picker_opened"
  | "asset_deleted"
  | "asset_renamed";

export type OnboardingEventProps = Record<string, string | number | boolean | null | undefined>;

type AnalyticsSink = (userId: string, event: OnboardingEvent, props?: OnboardingEventProps) => void;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
}

// Default sink writes a durable per-day counter into OnboardingEventDaily, so
// the activation funnel is actually queryable — previously this was log-only
// (logger.info), so welcome_shown/tour_*/hint_dismissed never landed anywhere
// a dashboard could read. Mirrors lib/marketing-analytics.ts's default sink.
// Aggregate (one row per event per UTC day), matching this codebase's
// no-per-visitor-row stance; swapping in PostHog/Segment later is still a
// one-line setOnboardingAnalyticsSink call. Fire-and-forget so trackOnboarding-
// Event stays synchronous and non-blocking for its callers.
let sink: AnalyticsSink = (userId, event, props) => {
  void props;
  const date = todayKey();
  void prisma.onboardingEventDaily
    .upsert({
      where: { date_event: { date, event } },
      create: { date, event, count: 1 },
      update: { count: { increment: 1 } },
    })
    .catch((err) => logger.error("onboarding-analytics", `persist failed for ${event}`, err));
};

export function setOnboardingAnalyticsSink(fn: AnalyticsSink): void {
  sink = fn;
}

// Never throws — a broken analytics call must not break the feature it's
// instrumenting, matching lib/quests.ts's markQuestComplete convention.
export function trackOnboardingEvent(
  userId: string,
  event: OnboardingEvent,
  props?: OnboardingEventProps,
): void {
  try {
    sink(userId, event, props);
  } catch (err) {
    logger.error("onboarding-analytics", `sink failed for ${event}`, err);
  }
}
