import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { synthesizeVoice } from "@/utils/elevenlabs";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, voiceId, projectId } = await req.json();
  if (!text || !voiceId || !projectId) {
    return NextResponse.json({ error: "text, voiceId, and projectId required" }, { status: 400 });
  }

  try {
    const { audioBuffer, wordTimings } = await synthesizeVoice(text, voiceId);
    const key = `voice/${projectId}.mp3`;
    const audioUrl = await uploadBufferToS3(audioBuffer, key, "audio/mpeg");

    return NextResponse.json({ audioUrl, wordTimings });
  } catch (err) {
    logger.error("generate/voice", "request failed", err);
    return NextResponse.json({ error: "Voice generation failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:voice" });
