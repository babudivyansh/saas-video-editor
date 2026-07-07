import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { synthesizeVoice } from "@/utils/elevenlabs";
import { resolveVoiceId } from "@/utils/voice-ids";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { markQuestComplete } from "@/lib/quests";
import { firePostCreditSpendEmails, fireZeroCreditsEmail } from "@/lib/credit-events";

export const maxDuration = 120;

// ElevenLabs Flash TTS bills $0.05/1,000 chars — capped so the worst case
// (~₹9.5 at 2,000 chars) stays well under 2 credits' revenue even at the
// cheapest per-credit plan (Studio Yearly, ~₹9.41/credit = ~₹18.8).
const MAX_CHARS = 2000;
// Was 1 credit — that only broke even against the 2,000-char cap's ~₹9.5
// worst-case cost at the cheapest per-credit plan. Matches the 2-credit
// price already advertised via TOOL_DEFAULTS/tool-costs.
const CREDIT_COST = 2;

async function refundCredit(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: CREDIT_COST } },
  });
  const cached = await redis.get(`credits:${userId}`);
  if (cached !== null) {
    await redis.set(`credits:${userId}`, String(parseInt(cached, 10) + CREDIT_COST), "EX", 3600);
  }
}

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
    exaggeration?: number;
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

  // Fast pre-check against cached credit balance
  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cachedBal = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cachedBal !== null && cachedBal < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  // Deduct credit before the paid call; refund on any failure below
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: CREDIT_COST } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
    fireZeroCreditsEmail(auth.userId);
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);
  firePostCreditSpendEmails(auth.userId, user.credits);

  try {
    const voiceId = resolveVoiceId(voiceSlug);
    const { audioBuffer, wordTimings } = await synthesizeVoice(text, voiceId, {
      stability: body.stability,
      similarityBoost: body.similarityBoost,
      style: body.exaggeration,
    });

    const durationMs = wordTimings.length ? wordTimings[wordTimings.length - 1].end : 0;

    const key = `voiceovers/${auth.userId}/${randomUUID()}.mp3`;
    const audioUrl = await uploadBufferToS3(audioBuffer, key, "audio/mpeg");

    void markQuestComplete(auth.userId, "hear-yourself-out");
    return NextResponse.json({
      audioUrl,
      durationMs,
      characters: text.length,
      voiceId: voiceSlug,
      title: (body.title ?? "").trim() || "Untitled voiceover",
    });
  } catch (err) {
    console.error("[tools/voiceover]", err);
    try { await refundCredit(auth.userId); } catch { /* swallow */ }
    return NextResponse.json({ error: "Voice generation failed. Please try again." }, { status: 500 });
  }
}
