import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-handler";
import { getActiveVoices } from "@/lib/voices/registry";
import { elevenLabsKeyProblem } from "@/utils/elevenlabs";

// The voice picker's data source — one route for every surface that chooses a
// voice (reddit-video, text-video, voiceover, voice-changer, AI creator, the
// legacy editor). Before this each of those compiled in its own list.
//
// `providerVoiceId` is STRIPPED, exactly as /api/caption-templates strips
// providerTemplateId: the id that routes a synthesis call stays server-side, so
// a voice can be re-pointed (or a slug moved to a cloned voice) without a client
// release, and the public catalogue is not a scraped list of provider ids.
//
// `configured: false` is returned rather than an empty list when the key is
// unusable. An empty list is indistinguishable from "this account has no
// voices" and made a broken key look like an empty product.
export const GET = withApi(async () => {
  const problem = elevenLabsKeyProblem();
  const voices = await getActiveVoices();

  return NextResponse.json({
    configured: problem === null,
    voices: voices.map((v) => ({
      slug: v.slug,
      label: v.label,
      description: v.description ?? null,
      gender: v.gender,
      age: v.age,
      accent: v.accent ?? null,
      languages: v.languages,
      category: v.category,
      // Whether the provider lets free-plan accounts use it, and whether it
      // bills at a multiple of the ordinary per-character rate. The UI needs
      // both to price a render honestly before the click.
      free: v.free,
      creditMultiplier: v.creditMultiplier,
      // Provider-hosted mp3. Playing it costs nothing; synthesizing a preview
      // does, which is why the picker prefers this.
      previewUrl: v.previewUrl ?? null,
    })),
  });
});
