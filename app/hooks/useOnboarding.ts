"use client";
import { useState, useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";
import type { PrimaryGoalId } from "@/lib/onboarding-config";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type TeamOrIndividual = "individual" | "team";

interface CompleteParams {
  primaryGoal?: PrimaryGoalId;
  experienceLevel?: ExperienceLevel;
  teamOrIndividual?: TeamOrIndividual;
}

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

  const complete = useCallback(async (params: CompleteParams) => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      });
      await refreshUser();
    } finally {
      setIsSubmitting(false);
    }
  }, [token, refreshUser]);

  const completeOnboarding = useCallback((goal: PrimaryGoalId) => complete({ primaryGoal: goal }), [complete]);
  const skipOnboarding = useCallback(() => complete({}), [complete]);
  // The welcome overlay's second (skippable) step — safe to call after
  // completeOnboarding already ran; it just re-sets onboardingCompletedAt to
  // a later timestamp, which has no user-visible effect.
  const savePreferences = useCallback(
    (params: { experienceLevel?: ExperienceLevel; teamOrIndividual?: TeamOrIndividual }) => complete(params),
    [complete],
  );

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
    savePreferences,
    advanceTour,
    finishTour,
  };
}
