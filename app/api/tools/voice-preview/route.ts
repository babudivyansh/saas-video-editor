import { NextRequest, NextResponse } from "next/server";
import { resolveVoiceId } from "@/utils/voice-ids";

export const maxDuration = 30;

const PREVIEW_TEXT = "This is the AI voice of BlogVerse.";

// Generates a short TTS sample for the voice picker preview buttons.
// No auth required — it's just a demo phrase, cached on the client per slug.
export async function POST(req: NextRequest) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Voice generation is not configured" }, { status: 503 });
  }

  let slug = "";
  try {
    const body = await req.json();
    slug = (body.slug ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const voiceId = resolveVoiceId(slug);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: PREVIEW_TEXT,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        output_format: "mp3_44100_128",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[voice-preview]", res.status, err);
    return NextResponse.json({ error: "Preview generation failed" }, { status: 502 });
  }

  // Stream the audio directly to the browser
  return new Response(res.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      // Client caches per slug — no server-side caching needed
      "Cache-Control": "no-store",
    },
  });
}
