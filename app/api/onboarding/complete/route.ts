import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRIMARY_GOALS } from "@/lib/onboarding-config";

const GOAL_IDS = PRIMARY_GOALS.map(g => g.id);
const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
const TEAM_OR_INDIVIDUAL = ["individual", "team"] as const;

// Marks the welcome screen as done (completed or skipped) so it never shows
// again. onboardingCompletedAt is always server-set — never trust a
// client-supplied timestamp for this. Also accepts the optional Phase 3
// personalization fields, since the welcome overlay calls this same endpoint
// again from its second (skippable) preferences step — re-setting
// onboardingCompletedAt to a later timestamp on that second call is harmless.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const primaryGoal = typeof body.primaryGoal === "string" ? body.primaryGoal : null;
  if (primaryGoal && !GOAL_IDS.includes(primaryGoal as (typeof GOAL_IDS)[number])) {
    return NextResponse.json({ error: "Invalid primary-goal value" }, { status: 400 });
  }
  const experienceLevel = typeof body.experienceLevel === "string" ? body.experienceLevel : null;
  if (experienceLevel && !EXPERIENCE_LEVELS.includes(experienceLevel as (typeof EXPERIENCE_LEVELS)[number])) {
    return NextResponse.json({ error: "Invalid experience-level value" }, { status: 400 });
  }
  const teamOrIndividual = typeof body.teamOrIndividual === "string" ? body.teamOrIndividual : null;
  if (teamOrIndividual && !TEAM_OR_INDIVIDUAL.includes(teamOrIndividual as (typeof TEAM_OR_INDIVIDUAL)[number])) {
    return NextResponse.json({ error: "Invalid team-or-individual value" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: {
      onboardingCompletedAt: new Date(),
      ...(primaryGoal ? { primaryGoal } : {}),
      ...(experienceLevel ? { experienceLevel } : {}),
      ...(teamOrIndividual ? { teamOrIndividual } : {}),
    },
    select: { id: true, onboardingCompletedAt: true, primaryGoal: true, experienceLevel: true, teamOrIndividual: true },
  });

  return NextResponse.json({ user });
}
