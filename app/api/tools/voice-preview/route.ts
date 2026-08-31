import { NextRequest, NextResponse } from "next/server";
import { resolveVoiceId } from "@/utils/voice-ids";
import { synthesizeVoice } from "@/utils/elevenlabs";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";

export const maxDuration = 30;

const PREVIEW_TEXT = "This is the AI voice of BlogVerse.";

// Generates a short TTS sample for the voice picker preview buttons.
// No auth required — it's just a demo phrase, cached on the client per slug.
//
// Goes through the shared synthesizeVoice() wrapper (same as real
// generation) rather than a hand-rolled fetch — it used to call the plain
// (non-timestamped) endpoint with a different, more expensive model
// (eleven_multilingual_v2 vs the eleven_flash_v2_5 every real generation
// uses), so what a user previewed didn't represent what they'd actually get
// or be billed for, and never retried a 429/5xx.
async function handlePOST(req: NextRequest) {
  if (!env.ELEVENLABS_API_KEY) {
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

  try {
    const { audioBuffer } = await synthesizeVoice(PREVIEW_TEXT, voiceId);
    return new Response(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        // Client caches per slug — no server-side caching needed
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("voice-preview", "ElevenLabs error", err);
    return NextResponse.json({ error: "Preview generation failed" }, { status: 502 });
  }
}

// Same bucket/limit as before this was converted to the shared wrapper —
// unauthenticated route, so this keys on IP either way.
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 3600, keyBy: "ip", name: "voice-preview" });
