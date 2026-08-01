import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      phone: true,
      credits: true, // denormalized total of the three buckets below
      subscriptionCredits: true,
      purchasedCredits: true,
      bonusCredits: true,
      bonusCreditsExpireAt: true,
      createdAt: true,
      role: true,
      firstName: true,
      lastName: true,
      name: true,
      avatarUrl: true,
      gender: true,
      intendedUse: true,
      onboardingCompletedAt: true,
      primaryGoal: true,
      experienceLevel: true,
      teamOrIndividual: true,
      tourStep: true,
      tourCompletedAt: true,
      dismissedHints: true,
      subscriptionEndsAt: true,
      subscriptionCancelledAt: true,
      nextRefillAt: true,
      monthlyCredits: true,
      // Lets the client hide the "start free trial" CTA for accounts that have
      // already used theirs, instead of offering a button the checkout route
      // will reject.
      trialUsedAt: true,
      trialEndsAt: true,
      // Dunning state, so the billing page can tell the user their card failed
      // instead of continuing to show "Renews in N days".
      paymentFailedAt: true,
      paymentFailureCount: true,
      // Security/account-dashboard surface (Settings hub) — closes the audit
      // finding that lastLoginAt was tracked but never actually sent to the client.
      emailVerifiedAt: true,
      twoFactorEnabled: true,
      passwordChangedAt: true,
      lastLoginAt: true,
      preferredLanguage: true,
      plan: { select: { id: true, slug: true, name: true, credits: true, priceInPaise: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    user: {
      ...user,
      creditBalances: {
        bonus: user.bonusCredits,
        subscription: user.subscriptionCredits,
        purchased: user.purchasedCredits,
        total: user.credits,
      },
    },
  });
}
