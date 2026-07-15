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

  // tourStep only ever becomes non-null once the app itself starts a tour for
  // this user, so this is inherently safe for pre-existing users too — they
  // can never have a non-null tourStep to trigger a surprise resume.
  const shouldResumeTour = !!user && user.tourStep != null && user.tourCompletedAt == null;

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

  // Fire-and-forget: only needs to persist so a reload resumes at the right
  // step. The tour's own local state (not user.tourStep) drives its render,
  // so there's no need to block on refreshUser for every single step.
  const advanceTour = useCallback((step: number) => {
    if (!token) return;
    fetch("/api/onboarding/tour", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ step }),
    }).catch(() => {});
  }, [token]);

  const finishTour = useCallback(async () => {
    if (!token) return;
    await fetch("/api/onboarding/tour", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ completed: true }),
    });
    await refreshUser();
  }, [token, refreshUser]);

  return {
    shouldShowWelcome,
    shouldResumeTour,
    tourStep: user?.tourStep ?? 0,
    isSubmitting,
    completeOnboarding,
    skipOnboarding,
    advanceTour,
    finishTour,
  };
}
