import type { NextRequest } from "next/server";
import { GET as webVoices } from "@/app/api/voices/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";
import { listClones } from "@/lib/mobile/voices";
import { ttsLanguageLabel } from "@/lib/voices/models";

type WebVoice = { slug: string; label: string; description: string | null; gender: string; accent: string | null; previewUrl: string | null; creditMultiplier: number; category: string; languages: string[] };

// GET /api/mobile/v1/voices → { configured, voices }: the voices a voiceover
// can use, from the web's catalogue (/api/voices). `id` is what POST /jobs
// { type: "voiceover", voiceId } takes. The person's cloned voices come first
// ("clone:<id>", no preview), so every voice picker offers them. `language` is
// a Voice Library voice's own language, for the app's language filter; the
// account's multilingual voices (and clones) have none.
export const GET = withMobileAuth(async (req: NextRequest, auth) => {
  const r = await callWeb(webVoices, req, undefined, "GET");
  if (r.status >= 400) return webError(r);
  const voices = (r.json.voices as WebVoice[] | undefined) ?? [];
  const clones = (await listClones(auth.userId)).map((c) => ({ id: c.id, name: c.name, description: "Your cloned voice", gender: "custom", accent: null, previewUrl: null, creditMultiplier: 1, language: null, languageLabel: null }));
  return mobileJson({
    configured: r.json.configured !== false,
    voices: [...clones, ...voices.map((v) => {
      const language = v.category === "library" ? v.languages[0] ?? null : null;
      return { id: v.slug, name: v.label, description: v.description, gender: v.gender, accent: v.accent, previewUrl: v.previewUrl, creditMultiplier: v.creditMultiplier, language, languageLabel: language ? ttsLanguageLabel(language) : null };
    })],
  });
});
