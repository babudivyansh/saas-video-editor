// screen: E-Grow
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { GrowHero } from "@/features/onboarding/heroes";

export default function Screen() {
  return (
    <OnboardingPage
      step={3}
      title="Post everywhere. See what lands."
      body="Schedule YouTube Shorts from one place, track Instagram and Facebook too, and see which clips pull views."
      cta="Start creating"
      next="/login"
      photoOpacity={0.15}
      hero={<GrowHero />}
    />
  );
}
