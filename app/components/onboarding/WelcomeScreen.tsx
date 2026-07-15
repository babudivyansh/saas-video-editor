"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useOnboarding, type ExperienceLevel, type TeamOrIndividual } from "@/app/hooks/useOnboarding";
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

const EXPERIENCE_OPTIONS: { id: ExperienceLevel; label: string }[] = [
  { id: "beginner", label: "New to this" },
  { id: "intermediate", label: "Some experience" },
  { id: "advanced", label: "Very experienced" },
];

const TEAM_OPTIONS: { id: TeamOrIndividual; label: string }[] = [
  { id: "individual", label: "Just me" },
  { id: "team", label: "My team" },
];

type Step = "goal" | "preferences" | "tour-offer";

const STEP_COPY: Record<Step, { title: string; body: string }> = {
  goal: { title: "", body: "" }, // uses the personalized-greeting branch below instead
  preferences: {
    title: "A couple quick questions",
    body: "This helps us tailor tips and recommendations to you — totally optional.",
  },
  "tour-offer": {
    title: "Nice choice!",
    body: "Want a 60-second tour of Clipiro before you dive in?",
  },
};

export function WelcomeScreen({ firstName, resumeProject, onStartTour }: WelcomeScreenProps) {
  const router = useRouter();
  const { isSubmitting, completeOnboarding, skipOnboarding, savePreferences, trackEvent } = useOnboarding();
  const [pendingGoal, setPendingGoal] = useState<PrimaryGoalId | "resume" | null>(null);
  const [step, setStep] = useState<Step>("goal");
  const [chosenGoal, setChosenGoal] = useState<{ id: PrimaryGoalId; href: string } | null>(null);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null);
  const [teamOrIndividual, setTeamOrIndividual] = useState<TeamOrIndividual | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once per mount, not on every trackEvent identity change
  useEffect(() => { trackEvent("welcome_shown"); }, []);

  // Moves keyboard focus into the dialog on open, matching standard modal
  // behavior — without this, focus stays wherever it was on the page behind
  // the overlay.
  useEffect(() => { dialogRef.current?.focus(); }, []);

  async function handleSelectGoal(goal: PrimaryGoalId, href: string) {
    setPendingGoal(goal);
    await completeOnboarding(goal);
    setPendingGoal(null);
    setChosenGoal({ id: goal, href });
    setStep("preferences");
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

  async function handlePreferencesContinue() {
    if (experienceLevel || teamOrIndividual) {
      await savePreferences({
        ...(experienceLevel ? { experienceLevel } : {}),
        ...(teamOrIndividual ? { teamOrIndividual } : {}),
      });
    }
    setStep("tour-offer");
  }

  function handleTakeTour() {
    onStartTour();
  }

  function handleSkipToTool() {
    if (chosenGoal) router.push(chosenGoal.href);
  }

  function handleEscape() {
    if (step === "tour-offer") handleSkipToTool();
    else if (step === "preferences") setStep("tour-offer");
    else handleSkip();
  }

  const heading = step === "goal"
    ? (firstName ? `Hey ${firstName}, let's get you started` : "Let's get you started")
    : STEP_COPY[step].title;
  const subtext = step === "goal"
    ? "Clipiro turns raw footage and simple prompts into finished, share-ready videos — clips, AI images, voiceovers, and full edits, all in one place."
    : STEP_COPY[step].body;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Welcome to Clipiro">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={e => { if (e.key === "Escape") handleEscape(); }}
        className="relative z-10 w-full max-w-[640px] rounded-2xl shadow-2xl overflow-hidden bg-white max-h-[90vh] overflow-y-auto outline-none"
      >
        <div className="grad-brand px-8 pt-10 pb-8 text-center">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">Welcome to Clipiro</p>
          <h1 className="text-white text-2xl font-extrabold mb-2">{heading}</h1>
          <p className="text-white/80 text-sm max-w-[440px] mx-auto">{subtext}</p>
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
          ) : step === "preferences" ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">Experience level</p>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setExperienceLevel(opt.id)}
                      className={`text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors ${
                        experienceLevel === opt.id
                          ? "bg-brand text-white border-brand"
                          : "bg-white text-ink-soft border-card-border hover:border-violet-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">Who&apos;s this for?</p>
                <div className="flex flex-wrap gap-2">
                  {TEAM_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setTeamOrIndividual(opt.id)}
                      className={`text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors ${
                        teamOrIndividual === opt.id
                          ? "bg-brand text-white border-brand"
                          : "bg-white text-ink-soft border-card-border hover:border-violet-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handlePreferencesContinue}
                disabled={isSubmitting}
                className="w-full text-center text-sm font-semibold text-white grad-brand px-4 py-2.5 rounded-full shadow-glow hover:shadow-glow-hover transition-all disabled:opacity-50"
              >
                Continue
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

          {(step === "goal" || step === "preferences") && (
            <div className="mt-6 text-center">
              <button
                onClick={step === "goal" ? handleSkip : () => setStep("tour-offer")}
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
