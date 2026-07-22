import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spendCredits, restoreSpend } from "@/lib/credits";
import { extractAudio } from "@/utils/ffmpeg-render";
import { transcribe } from "@/lib/transcription";
import { downloadFile } from "@/utils/download";
import { logger } from "@/lib/logger";

const CREDIT_COST = 1;

// POST /api/editor/captions { assetId, languageCode? }
// Transcribes a video asset from the user's library and returns word-level
// timings (source-time seconds). The client turns these into caption text
// clips aligned to wherever the clip sits on the timeline. Costs 1 credit;
// refunded if transcription fails. languageCode is optional — omitted or
// "auto" lets Scribe auto-detect the spoken language (the previous, only
// behavior before the Caption panel's language selector existed).
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assetId = body.assetId as string | undefined;
  const languageCode = body.languageCode as string | undefined;
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId: auth.userId } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  // Bucket-aware atomic spend (lib/credits.ts).
  const spendRef = `editor-captions:${assetId}:${Date.now()}`;
  const spend = await spendCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    reason: "spend:editor-captions",
    refId: spendRef,
  });
  if (!spend.ok) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const tmp = os.tmpdir();
  const stamp = `captions-${auth.userId}-${Date.now()}`;
  const mediaPath = path.join(tmp, `${stamp}-src${path.extname(new URL(asset.url).pathname) || ".mp4"}`);
  const audioPath = path.join(tmp, `${stamp}.mp3`);

  try {
    await downloadFile(asset.url, mediaPath);
    await extractAudio(mediaPath, audioPath);
    const words = await transcribe(fs.readFileSync(audioPath), "audio/mpeg", languageCode);
    if (words.length === 0) {
      throw new Error("No speech detected (or transcription unavailable)");
    }
    return NextResponse.json({ words, creditsRemaining: spend.balances.total });
  } catch (err) {
    // Refund on failure — restores the exact buckets the spend drained.
    await restoreSpend({ userId: auth.userId, refId: spendRef, reason: "refund:editor-captions-failed" });
    const message = err instanceof Error ? err.message : "Transcription failed";
    logger.error("editor-captions", "failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    for (const f of [mediaPath, audioPath]) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}
