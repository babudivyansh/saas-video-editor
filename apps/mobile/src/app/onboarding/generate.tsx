// screen: E-Generate
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { GenerateHero } from "@/features/onboarding/heroes";

export default function Screen() {
  return (
    <OnboardingPage
      step={1}
      title="AI finds the moments worth posting."
      body="Paste a YouTube link or upload a file. Clipiro reads the transcript, spots the hooks and cuts ready-to-post clips."
      cta="Next"
      next="/onboarding/create"
      photoOpacity={0.2}
      hero={<GenerateHero />}
    />
  );
}
