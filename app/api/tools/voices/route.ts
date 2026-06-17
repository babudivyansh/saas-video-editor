import { NextResponse } from "next/server";
import { VOICE_ID_MAP } from "@/utils/voice-ids";
import { listVoices } from "@/utils/elevenlabs";

// Returns { [slug]: previewUrl } — no auth required, preview URLs are public.
// Called once by the voice picker modal to populate play-preview buttons.
export async function GET() {
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({});
  }
  try {
    const voices = await listVoices();
    const idToPreview: Record<string, string> = {};
    for (const v of voices) {
      if (v.preview_url) idToPreview[v.voice_id] = v.preview_url;
    }
    const result: Record<string, string> = {};
    for (const [slug, voiceId] of Object.entries(VOICE_ID_MAP)) {
      if (idToPreview[voiceId]) result[slug] = idToPreview[voiceId];
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({});
  }
}
