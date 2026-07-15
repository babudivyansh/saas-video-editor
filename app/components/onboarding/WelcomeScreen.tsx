"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnboarding } from "@/app/hooks/useOnboarding";
import { PRIMARY_GOALS, type PrimaryGoalId } from "@/lib/onboarding-config";

interface InProgressProject {
  id: string;
  title: string;
  productType: string;
}

function inProgressHref(p: InProgressProject): string {
  if (p.productType === "editor") return `/dashboard/editor?projectId=${p.id}`;
  return `/dashboard/create/auto-clip?project=${p.id}`;
}

interface WelcomeScreenProps {
  firstName: string | null | undefined;
  /** Present when the (rare) gated user already has an in-progress project. */
  resumeProject?: InProgressProject;
  /** Called when the user opts into the guided tour instead of navigating away. */
  onStartTour: () => void;
}

const GOAL_TINT: Record<PrimaryGoalId, string> = {
  "auto-clip": "bg-tint-blue text-brand border-blue-100",
  video: "bg-tint-emerald text-emerald-500 border-emerald-100",
  image: "bg-tint-fuchsia text-accent-fuchsia border-fuchsia-100",
  voiceover: "bg-tint-violet text-accent-violet border-violet-100",
  editor: "bg-tint-amber text-amber-500 border-amber-100",
};

type Step = "goal" | "tour-offer";

export function WelcomeScreen({ firstName, resumeProject, onStartTour }: WelcomeScreenProps) {
  const router = useRouter();
  const { isSubmitting, completeOnboarding, skipOnboarding } = useOnboarding();
  const [pendingGoal, setPendingGoal] = useState<PrimaryGoalId | "resume" | null>(null);
  const [step, setStep] = useState<Step>("goal");
  const [chosenGoal, setChosenGoal] = useState<{ id: PrimaryGoalId; href: string } | null>(null);

  async function handleSelectGoal(goal: PrimaryGoalId, href: string) {
    setPendingGoal(goal);
    await completeOnboarding(goal);
    setPendingGoal(null);
    setChosenGoal({ id: goal, href });
    setStep("tour-offer");
  }

  async function handleResume() {
    if (!resumeProject) return;
    setPendingGoal("resume");
    await skipOnboarding();
    router.push(inProgressHref(resumeProject));
  }

  async function handleSkip() {
    await skipOnboarding();
  }

  function handleTakeTour() {
    onStartTour();
  }

  function handleSkipToTool() {
    if (chosenGoal) router.push(chosenGoal.href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Welcome to Clipiro">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-[640px] rounded-2xl shadow-2xl overflow-hidden bg-white max-h-[90vh] overflow-y-auto">
        <div className="grad-brand px-8 pt-10 pb-8 text-center">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">Welcome to Clipiro</p>
          <h1 className="text-white text-2xl font-extrabold mb-2">
            {step === "tour-offer"
              ? "Nice choice!"
              : firstName ? `Hey ${firstName}, let's get you started` : "Let's get you started"}
          </h1>
          <p className="text-white/80 text-sm max-w-[440px] mx-auto">
            {step === "tour-offer"
              ? "Want a 60-second tour of Clipiro before you dive in?"
              : "Clipiro turns raw footage and simple prompts into finished, share-ready videos — clips, AI images, voiceovers, and full edits, all in one place."}
          </p>
        </div>

        <div className="px-8 py-7">
          {step === "tour-offer" ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleTakeTour}
                className="flex-1 text-left rounded-[var(--radius-card)] border border-blue-100 bg-tint-blue p-4 transition-all hover:shadow-card-hover hover:-translate-y-0.5"
              >
                <p className="text-sm font-semibold text-ink">Take the 60-second tour</p>
                <p className="text-xs text-ink-soft mt-0.5">See where everything lives before you start</p>
              </button>
              <button
                onClick={handleSkipToTool}
                className="flex-1 text-left rounded-[var(--radius-card)] border border-card-border bg-white p-4 transition-all hover:shadow-card-hover hover:-translate-y-0.5"
              >
                <p className="text-sm font-semibold text-ink">Skip, take me to my tool</p>
                <p className="text-xs text-ink-soft mt-0.5">Jump straight into creating</p>
              </button>
            </div>
          ) : resumeProject ? (
            <>
              <p className="text-sm font-semibold text-ink mb-3">Continue where you left off</p>
              <button
                onClick={handleResume}
                disabled={isSubmitting}
                className={`w-full text-left rounded-[var(--radius-card)] border border-card-border bg-tint-blue p-4 transition-all hover:shadow-card-hover hover:-translate-y-0.5 disabled:opacity-50 ${pendingGoal === "resume" ? "animate-pulse" : ""}`}
              >
                <p className="text-sm font-semibold text-ink">{resumeProject.title}</p>
                <p className="text-xs text-ink-soft mt-0.5">Pick this back up now</p>
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink mb-3">What do you want to create?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRIMARY_GOALS.map(goal => (
                  <button
                    key={goal.id}
                    onClick={() => handleSelectGoal(goal.id, goal.href)}
                    disabled={isSubmitting}
                    className={`text-left rounded-[var(--radius-card)] border p-4 transition-all hover:shadow-card-hover hover:-translate-y-0.5 disabled:opacity-50 ${GOAL_TINT[goal.id]} ${pendingGoal === goal.id ? "animate-pulse" : ""}`}
                  >
                    <p className="text-sm font-semibold text-ink">{goal.label}</p>
                    <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{goal.description}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "goal" && (
            <div className="mt-6 text-center">
              <button
                onClick={handleSkip}
                disabled={isSubmitting}
                className="text-xs text-gray-400 hover:text-ink-soft transition-colors disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
