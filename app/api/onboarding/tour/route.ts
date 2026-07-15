import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOUR_STEPS } from "@/lib/onboarding-tour-config";
import { trackOnboardingEvent } from "@/lib/onboarding-analytics";

// Updates guided-tour progress. Called on every step advance (so a closed tab
// resumes where it left off) and once more with completed:true on finish/skip.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const completed = body.completed === true;
  const step = typeof body.step === "number" ? Math.trunc(body.step) : null;
  if (step !== null && (step < 0 || step >= TOUR_STEPS.length)) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: {
      ...(step !== null ? { tourStep: step } : {}),
      ...(completed ? { tourCompletedAt: new Date() } : {}),
    },
    select: { id: true, tourStep: true, tourCompletedAt: true },
  });

  // Client distinguishes finish vs. skip in its own copy/flow, but both call
  // this endpoint identically — tracked as one event here since the
  // difference isn't meaningful server-side.
  if (completed) trackOnboardingEvent(auth.userId, "tour_completed");
  else if (step !== null) trackOnboardingEvent(auth.userId, "tour_step_advanced", { step });

  return NextResponse.json({ user });
}
