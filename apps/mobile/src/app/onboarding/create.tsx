// screen: E-Create
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { CreateHero } from "@/features/onboarding/heroes";

export default function Screen() {
  return (
    <OnboardingPage
      step={2}
      title="Captions and reframing, done for you."
      body="Animated captions, 9:16 reframing that follows the speaker, and your brand kit on every clip."
      cta="Next"
      next="/onboarding/grow"
      photoOpacity={0.15}
      hero={<CreateHero />}
    />
  );
}
