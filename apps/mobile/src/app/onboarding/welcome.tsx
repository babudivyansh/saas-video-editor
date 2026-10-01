// screen: E-Welcome
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { WelcomeHero } from "@/features/onboarding/heroes";

export default function Screen() {
  return (
    <OnboardingPage
      step={0}
      title="Your long videos, cut into shorts that travel."
      body="Podcasts, streams, webinars and vlogs. One upload becomes a week of Shorts and Reels."
      cta="Get started"
      next="/onboarding/generate"
      hero={<WelcomeHero />}
    />
  );
}
