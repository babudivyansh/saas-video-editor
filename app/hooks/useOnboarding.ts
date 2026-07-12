"use client";
import { useState, useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";
import type { PrimaryGoalId } from "@/lib/onboarding-config";

export function useOnboarding() {
  const { user, token, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Null onboardingCompletedAt means the welcome screen hasn't been completed
  // or skipped yet. Callers additionally gate this on "no existing projects"
  // so users who signed up before this feature shipped (all null) don't see
  // it retroactively.
  const shouldShowWelcome = !!user && user.onboardingCompletedAt == null;

  const complete = useCallback(async (primaryGoal?: PrimaryGoalId) => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(primaryGoal ? { primaryGoal } : {}),
      });
      await refreshUser();
    } finally {
      setIsSubmitting(false);
    }
  }, [token, refreshUser]);

  const completeOnboarding = useCallback((goal: PrimaryGoalId) => complete(goal), [complete]);
  const skipOnboarding = useCallback(() => complete(undefined), [complete]);

  return { shouldShowWelcome, isSubmitting, completeOnboarding, skipOnboarding };
}
