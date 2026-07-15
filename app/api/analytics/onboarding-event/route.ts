import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { trackOnboardingEvent, type OnboardingEvent } from "@/lib/onboarding-analytics";

const EVENTS: OnboardingEvent[] = [
  "welcome_shown",
  "welcome_goal_selected",
  "welcome_preferences_saved",
  "welcome_skipped",
  "tour_started",
  "tour_step_advanced",
  "tour_completed",
  "tour_skipped",
  "hint_dismissed",
  "quest_completed",
  "onboarding_restarted",
];

// Thin endpoint for client-only touchpoints (a hint being shown/dismissed, a
// tour step rendering) that have no natural server-side call site of their
// own. State changes that already hit the server (goal selection, quest
// completion) call trackOnboardingEvent directly instead of round-tripping
// through this route.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const event = typeof body.event === "string" ? body.event : null;
  if (!event || !EVENTS.includes(event as OnboardingEvent)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  const props = typeof body.props === "object" && body.props !== null ? body.props : undefined;

  trackOnboardingEvent(auth.userId, event as OnboardingEvent, props);

  return NextResponse.json({ ok: true });
}
