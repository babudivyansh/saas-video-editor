import { logger } from "./logger";

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
  | "onboarding_restarted";

export type OnboardingEventProps = Record<string, string | number | boolean | null | undefined>;

type AnalyticsSink = (userId: string, event: OnboardingEvent, props?: OnboardingEventProps) => void;

// Default sink is a structured log line — no analytics provider (PostHog,
// Segment, Mixpanel, ...) is installed in this codebase yet. Swapping in a
// real one later is a one-line change here, not a rewrite of every call site
// below.
let sink: AnalyticsSink = (userId, event, props) => {
  logger.info("onboarding-analytics", event, { userId, ...props });
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
