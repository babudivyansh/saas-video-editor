import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getActiveVoices } from "@/lib/voices/registry";
import { elevenLabsKeyProblem } from "@/utils/elevenlabs";

// The voice picker's data source — one route for every surface that chooses a
// voice (reddit-video, text-video, voiceover, voice-changer, AI creator, the
// legacy editor). Each of those used to compile in its own list.
//
// PUBLIC, like the /api/tools/voices route it replaces. The create pages render
// for logged-out visitors, and this response carries nothing sensitive: names,
// genders, languages and the provider's own public preview URLs. What costs
// money is SYNTHESIS, and that is what requires an account —
// /api/tools/voice-preview is authenticated for exactly that reason.
//
// `providerVoiceId` is stripped, as /api/caption-templates strips
// providerTemplateId: the id that routes a paid call stays server-side, so a
// voice can be re-pointed without a client release and the public catalogue is
// not a scraped list of provider ids.
//
// `configured: false` is returned rather than an empty list when the key is
// unusable — an empty list is indistinguishable from "this account has no
// voices", and made a broken key look like an empty product.
async function handleGET() {
  const problem = elevenLabsKeyProblem();
  const voices = await getActiveVoices();

  return NextResponse.json(
    {
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
        // bills at a multiple of the usual per-character rate. The UI needs
        // both to price a render honestly before the click.
        free: v.free,
        creditMultiplier: v.creditMultiplier,
        // Provider-hosted mp3. Playing it costs nothing; synthesizing a preview
        // does, which is why the picker prefers this.
        previewUrl: v.previewUrl ?? null,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}

export const GET = withRateLimit(
  (_req: NextRequest) => handleGET(),
  { limit: 60, windowSec: 3600, keyBy: "ip", name: "voices" },
);
