import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRIMARY_GOALS } from "@/lib/onboarding-config";

const GOAL_IDS = PRIMARY_GOALS.map(g => g.id);

// Marks the welcome screen as done (completed or skipped) so it never shows
// again. onboardingCompletedAt is always server-set — never trust a
// client-supplied timestamp for this.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const primaryGoal = typeof body.primaryGoal === "string" ? body.primaryGoal : null;
  if (primaryGoal && !GOAL_IDS.includes(primaryGoal as (typeof GOAL_IDS)[number])) {
    return NextResponse.json({ error: "Invalid primary-goal value" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: {
      onboardingCompletedAt: new Date(),
      ...(primaryGoal ? { primaryGoal } : {}),
    },
    select: { id: true, onboardingCompletedAt: true, primaryGoal: true },
  });

  return NextResponse.json({ user });
}
