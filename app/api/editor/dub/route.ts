import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { startDubbing, getDubbingStatus, getDubbedAudio } from "@/utils/elevenlabs";
import { uploadBufferToS3 } from "@/utils/s3-upload";

export const maxDuration = 300;

const DUB_COST = 10; // credits per dub

async function refund(userId: string, cost: number) {
  try {
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } });
    const c = await redis.get(`credits:${userId}`);
    if (c !== null) await redis.set(`credits:${userId}`, String(parseInt(c, 10) + cost), "EX", 3600);
  } catch { /* non-fatal */ }
}

// AI dub a video into another language (preserves the speaker's voice). Async on
// ElevenLabs' side; we poll up to the request budget, then upload the dubbed
// audio to S3 and return its URL so the client adds it as an audio track.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { videoUrl?: string; targetLang?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const videoUrl = (body.videoUrl ?? "").trim();
  const targetLang = (body.targetLang ?? "").trim();
  if (!videoUrl || !targetLang) return NextResponse.json({ error: "videoUrl and targetLang are required" }, { status: 400 });

  // Charge credits up-front (rollback on failure).
  const user = await prisma.user.update({
    where: { id: auth.userId }, data: { credits: { decrement: DUB_COST } }, select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: DUB_COST } } });
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

  try {
    const { dubbingId } = await startDubbing(videoUrl, targetLang);

    // Poll within the request budget (~4.5 min).
    const deadline = Date.now() + 270_000;
    let status: "dubbing" | "dubbed" | "failed" = "dubbing";
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 6000));
      status = await getDubbingStatus(dubbingId);
      if (status !== "dubbing") break;
    }

    if (status !== "dubbed") {
      await refund(auth.userId, DUB_COST);
      if (status === "failed") return NextResponse.json({ error: "Dubbing failed. Please try a different clip." }, { status: 502 });
      // Still processing — let the client resume later with the dubbingId.
      return NextResponse.json({ pending: true, dubbingId, targetLang });
    }

    const audio = await getDubbedAudio(dubbingId, targetLang);
    const key = `editor/${auth.userId}/dub-${dubbingId}-${targetLang}.mp3`;
    const audioUrl = await uploadBufferToS3(audio, key, "audio/mpeg");
    return NextResponse.json({ audioUrl, lang: targetLang });
  } catch (err) {
    console.error("[editor/dub]", err);
    await refund(auth.userId, DUB_COST);
    const msg = /API key not configured/.test(String(err))
      ? "AI dubbing isn't configured on this server."
      : "Couldn't dub this clip. Please try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
