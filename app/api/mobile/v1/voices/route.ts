import type { NextRequest } from "next/server";
import { GET as webVoices } from "@/app/api/voices/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

type WebVoice = { slug: string; label: string; description: string | null; gender: string; accent: string | null; previewUrl: string | null; creditMultiplier: number };

// GET /api/mobile/v1/voices → { configured, voices }: the voices a voiceover
// can use, from the web's catalogue (/api/voices). `id` is what POST /jobs
// { type: "voiceover", voiceId } takes.
export const GET = withMobileAuth(async (req: NextRequest) => {
  const r = await callWeb(webVoices, req, undefined, "GET");
  if (r.status >= 400) return webError(r);
  const voices = (r.json.voices as WebVoice[] | undefined) ?? [];
  return mobileJson({
    configured: r.json.configured !== false,
    voices: voices.map((v) => ({ id: v.slug, name: v.label, description: v.description, gender: v.gender, accent: v.accent, previewUrl: v.previewUrl, creditMultiplier: v.creditMultiplier })),
  });
});
