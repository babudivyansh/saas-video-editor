import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { synthesizeVoice } from "@/utils/elevenlabs";
import { resolveVoiceId } from "@/utils/voice-ids";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { chargeCredits, refundCredits, markGenerationStatus } from "@/lib/credits";
import { logger } from "@/lib/logger";

// The legacy /editor wizard's voice step.
//
// This route had four defects, all of them in 29 lines:
//
//   1. `projectId` came from the body and was used directly as an S3 key
//      (`voice/${projectId}.mp3`) with NO ownership check — any authenticated
//      user could overwrite another tenant's voice track.
//   2. No cap on `text`, so a single request could spend arbitrarily at the
//      provider (10 req/min/user).
//   3. No credit charge at all, while the equivalent /api/tools/voiceover
//      charges 2.
//   4. `voiceId` went straight to the provider without resolveVoiceId, so a
//      client could name any voice in the account — including a paid
//      multiplier voice — for free.
//
// It stays a route rather than being folded into /api/tools/voiceover because
// that one is an async job API (POST returns a jobId, the client polls) and
// this caller expects the audio URL in the response. Rewriting the legacy
// wizard to poll would be more code in a surface we are trying to retire.

/** Same ceiling as /api/tools/voiceover — one number, one worst-case cost. */
const MAX_CHARS = 2000;
/** Same price as the equivalent tool. Charging less here would be an arbitrage. */
const CREDIT_COST = 2;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, voiceId, projectId } = await req.json();
  if (!text || !voiceId || !projectId) {
    return NextResponse.json({ error: "text, voiceId, and projectId required" }, { status: 400 });
  }
  if (typeof text !== "string" || typeof voiceId !== "string" || typeof projectId !== "string") {
    return NextResponse.json({ error: "text, voiceId, and projectId must be strings" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Script is too long (max ${MAX_CHARS} characters).` },
      { status: 400 },
    );
  }

  // The S3 key is derived from projectId, so ownership has to be proven before
  // anything is written — not checked after, and not assumed from the session.
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const charge = await chargeCredits({
    userId: auth.userId,
    toolSlug: "generate-voice",
    amount: CREDIT_COST,
  });
  if (!charge.ok) {
    // Two distinct refusals: the admin kill-switch and an empty wallet. A 402
    // for a disabled tool would send the user to a top-up page that cannot
    // help them.
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Voice generation is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Insufficient credits", required: CREDIT_COST, balance: charge.balance },
      { status: 402 },
    );
  }

  try {
    // Through the resolver, so a slug means the same voice here as everywhere
    // else and a raw id still works for rows saved before slugs existed.
    const { audioBuffer, wordTimings } = await synthesizeVoice(text, resolveVoiceId(voiceId));
    const key = `voice/${projectId}.mp3`;
    const audioUrl = await uploadBufferToS3(audioBuffer, key, "audio/mpeg");

    if (charge.generationId) void markGenerationStatus(charge.generationId, "completed");
    return NextResponse.json({ audioUrl, wordTimings });
  } catch (err) {
    logger.error("generate/voice", "request failed", err);
    await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: charge.generationId }).catch(() => {});
    return NextResponse.json({ error: "Voice generation failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:voice" });
