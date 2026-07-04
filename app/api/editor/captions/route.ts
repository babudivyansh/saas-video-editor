import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { extractAudio } from "@/utils/ffmpeg-render";
import { transcribeAudio } from "@/utils/elevenlabs";
import { downloadFile } from "@/utils/download";

const CREDIT_COST = 1;

// POST /api/editor/captions { assetId }
// Transcribes a video asset from the user's library and returns word-level
// timings (source-time seconds). The client turns these into caption text
// clips aligned to wherever the clip sits on the timeline. Costs 1 credit;
// refunded if transcription fails.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assetId = body.assetId as string | undefined;
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId: auth.userId } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  // Atomic credit decrement with rollback (compile-route pattern).
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: CREDIT_COST } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

  const tmp = os.tmpdir();
  const stamp = `captions-${auth.userId}-${Date.now()}`;
  const mediaPath = path.join(tmp, `${stamp}-src${path.extname(new URL(asset.url).pathname) || ".mp4"}`);
  const audioPath = path.join(tmp, `${stamp}.mp3`);

  try {
    await downloadFile(asset.url, mediaPath);
    await extractAudio(mediaPath, audioPath);
    const words = await transcribeAudio(fs.readFileSync(audioPath));
    if (words.length === 0) {
      throw new Error("No speech detected (or transcription unavailable)");
    }
    return NextResponse.json({ words, creditsRemaining: user.credits });
  } catch (err) {
    // Refund on failure.
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
    const cached = await redis.get(`credits:${auth.userId}`);
    if (cached !== null) {
      await redis.set(`credits:${auth.userId}`, String(parseInt(cached, 10) + CREDIT_COST), "EX", 3600);
    }
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[editor-captions] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    for (const f of [mediaPath, audioPath]) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}
