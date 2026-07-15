import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackOnboardingEvent } from "@/lib/onboarding-analytics";

// Clears welcome-screen and tour completion so both show again on the next
// dashboard visit. Deliberately leaves primaryGoal/experienceLevel/
// teamOrIndividual untouched — those are still-useful personalization data,
// not part of "have you seen the intro" state.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { onboardingCompletedAt: null, tourCompletedAt: null, tourStep: null },
    select: { id: true, onboardingCompletedAt: true, tourCompletedAt: true, tourStep: true },
  });

  trackOnboardingEvent(auth.userId, "onboarding_restarted");

  return NextResponse.json({ user });
}
