import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { synthesizeVoice } from "@/utils/elevenlabs";
import { resolveVoiceId } from "@/utils/voice-ids";
import { uploadBufferToS3 } from "@/utils/s3-upload";

export const maxDuration = 120;

const MAX_CHARS = 5000;

// Standalone voiceover generator (no project needed). Takes a script + voice,
// runs ElevenLabs TTS, stores the mp3 on S3, and returns a playable URL plus
// the spoken duration so the UI can show a player and history entry.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    text?: string;
    voiceId?: string;
    title?: string;
    stability?: number;
    similarityBoost?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const voiceSlug = (body.voiceId ?? "").trim();

  if (!text) return NextResponse.json({ error: "Script text is required" }, { status: 400 });
  if (!voiceSlug) return NextResponse.json({ error: "A voice is required" }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Script is too long (max ${MAX_CHARS} characters)` },
      { status: 400 },
    );
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Voice generation is not configured" }, { status: 503 });
  }

  try {
    const voiceId = resolveVoiceId(voiceSlug);
    const { audioBuffer, wordTimings } = await synthesizeVoice(text, voiceId, {
      stability: body.stability,
      similarityBoost: body.similarityBoost,
    });

    const durationMs = wordTimings.length ? wordTimings[wordTimings.length - 1].end : 0;

    const key = `voiceovers/${auth.userId}/${randomUUID()}.mp3`;
    const audioUrl = await uploadBufferToS3(audioBuffer, key, "audio/mpeg");

    return NextResponse.json({
      audioUrl,
      durationMs,
      characters: text.length,
      voiceId: voiceSlug,
      title: (body.title ?? "").trim() || "Untitled voiceover",
    });
  } catch (err) {
    console.error("[tools/voiceover]", err);
    return NextResponse.json({ error: "Voice generation failed. Please try again." }, { status: 500 });
  }
}
