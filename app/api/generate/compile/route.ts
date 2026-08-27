import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { spendCredits, restoreSpend } from "@/lib/credits";
import { getRenderQueue, RenderJobPayload } from "@/lib/job-queue";
import { generateASS, runFFmpeg } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { downloadFile } from "@/utils/download";
import { markQuestComplete } from "@/lib/quests";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";

// Credit cost: 1 credit per video (you can adjust to minutes if you track duration)
const CREDIT_COST = 1;

// Refund the credit charged at enqueue time when an async render job fails.
async function refundRenderCredit(projectId: string) {
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    await restoreSpend({
      userId: proj.userId,
      refId: `compile:${projectId}`,
      amount: CREDIT_COST,
      reason: "refund:compile-failed",
    });
  } catch (e) {
    logger.error("refund", `failed to refund credit for project ${projectId}`, e);
  }
}

async function renderJob(payload: RenderJobPayload): Promise<void> {
  const { projectId, bgVideoUrl, voiceAudioUrl, musicUrl, wordTimings, subtitlesStyle } = payload;

  const tmp = os.tmpdir();
  const assPath = path.join(tmp, `${projectId}.ass`);
  const bgPath = path.join(tmp, `${projectId}-bg.mp4`);
  const voicePath = path.join(tmp, `${projectId}-voice.mp3`);
  const musicPath = musicUrl ? path.join(tmp, `${projectId}-music.mp3`) : undefined;
  const outPath = path.join(tmp, `${projectId}-output.mp4`);

  try {
    await Promise.all([
      downloadFile(bgVideoUrl, bgPath),
      downloadFile(voiceAudioUrl, voicePath),
      musicUrl && musicPath ? downloadFile(musicUrl, musicPath) : Promise.resolve(),
    ]);

    generateASS(wordTimings, subtitlesStyle, assPath);

    await runFFmpeg({
      bgVideoPath: bgPath,
      voiceAudioPath: voicePath,
      musicAudioPath: musicPath,
      assPath,
      outputPath: outPath,
    });

    const s3Key = `renders/${projectId}.mp4`;
    const videoUrl = await uploadFileToS3(outPath, s3Key, "video/mp4");

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl },
    });
  } catch (err) {
    logger.error("compile", `render failed for ${projectId}`, err);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });
    await refundRenderCredit(projectId);
  } finally {
    for (const f of [assPath, bgPath, voicePath, musicPath, outPath]) {
      if (f) try { fs.unlinkSync(f); } catch {}
    }
  }
}

const renderQueue = getRenderQueue(renderJob);

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check credits in Redis first (fast path)
  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const credits = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;

  if (credits !== null && credits < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json() as RenderJobPayload;
  if (!body.projectId || !body.bgVideoUrl || !body.voiceAudioUrl || !body.wordTimings) {
    return NextResponse.json({ error: "projectId, bgVideoUrl, voiceAudioUrl, and wordTimings required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Atomic double-submit guard (H6): only one concurrent request can flip a
  // project from draft/failed into rendering. A stale `findFirst` read above
  // can't serve as this guard — two concurrent requests would both see the
  // same pre-transition status — so the transition itself must be the check.
  const claimed = await prisma.project.updateMany({
    where: { id: body.projectId, userId: auth.userId, status: { in: ["draft", "failed"] } },
    data: { status: "rendering" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Render already in progress" }, { status: 409 });
  }

  // Bucket-aware atomic spend (lib/credits.ts).
  const spend = await spendCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    reason: "spend:compile",
    refId: `compile:${body.projectId}`,
  });
  if (!spend.ok) {
    await prisma.project.update({
      where: { id: body.projectId },
      data: { status: "draft" },
    });
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  renderQueue.enqueue(body.projectId, body);
  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "rendering", creditsRemaining: spend.balances.total });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:compile" });
