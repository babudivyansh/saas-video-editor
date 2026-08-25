import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { spendCredits, restoreSpend } from "@/lib/credits";
import { runStreamerFFmpeg, styleIndexToDrawtext } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { downloadFile } from "@/utils/download";
import { InProcessQueue } from "@/lib/job-queue";
import { markQuestComplete } from "@/lib/quests";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";
import { freshSourceUrl } from "@/lib/source-url";
import { classifyProjectRenderFailure } from "@/lib/project-render-failure";

export const maxDuration = 300;

const CREDIT_COST = 1;

interface StreamerPayload {
  projectId: string;
  titleText: string;
  subtitleStyleIndex: number;
}

// Refund the credit charged at enqueue time when an async render job fails.
async function refundRenderCredit(projectId: string) {
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    await restoreSpend({
      userId: proj.userId,
      refId: `streamer-video:${projectId}`,
      amount: CREDIT_COST,
      reason: "refund:streamer-video-failed",
    });
  } catch (e) {
    logger.error("refund", `failed to refund credit for project ${projectId}`, e);
  }
}

async function renderJob(payload: StreamerPayload): Promise<void> {
  const { projectId, titleText, subtitleStyleIndex } = payload;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.uploadedVideoUrl) {
    throw new Error(`Project ${projectId} missing uploadedVideoUrl`);
  }

  const tmp = os.tmpdir();
  const userPath = path.join(tmp, `${projectId}-user.mp4`);
  const outPath  = path.join(tmp, `${projectId}-output.mp4`);

  try {
    // Project.uploadedVideoUrl is the PRESIGNED upload URL (6h lifetime), not a
    // durable identity — reusing it made every project older than six hours fail
    // with 403 "Request has expired". Re-mint from the owned S3 key instead.
    // Same defect and same shared resolver as the AutoClip P0-3 incident; see
    // docs/stale-presigned-url-cross-product-fix.md.
    await downloadFile(await freshSourceUrl(project.uploadedVideoUrl, project.userId), userPath);

    const drawtextOpts = styleIndexToDrawtext(subtitleStyleIndex);
    await runStreamerFFmpeg({ userVideoPath: userPath, titleText, drawtextOpts, outputPath: outPath });

    const s3Key = `renders/${projectId}.mp4`;
    const videoUrl = await uploadFileToS3(outPath, s3Key, "video/mp4");

    await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl } });
  } catch (err) {
    const { category, userMessage } = classifyProjectRenderFailure(err);
    logger.error("streamer-video", `render failed for ${projectId} [${category}]`, err);
    // Bookkeeping must never mask the original failure or abort the steps after
    // it — the defect CI caught in the AutoClip P0-3 failure path (5e38744).
    // `.catch()` alone is not enough: it guards a rejected promise, not a
    // synchronous throw. Unguarded, a failed status write would skip the refund
    // and leave the user charged for a render that never produced anything.
    try {
      // The raw error can carry the presigned source URL, signature included
      // (utils/download.ts), so only the sanitized classification is persisted.
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "failed", failureReason: userMessage },
      });
    } catch (e) {
      logger.error("streamer-video", `could not mark project ${projectId} failed`, e);
    }
    try {
      await refundRenderCredit(projectId);
    } catch (e) {
      logger.error("streamer-video", `could not refund failed render for project ${projectId}`, e);
    }
  } finally {
    for (const f of [userPath, outPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}

let _queue: InProcessQueue<StreamerPayload> | null = null;
function getQueue() {
  if (!_queue) _queue = new InProcessQueue<StreamerPayload>("streamer-video", renderJob);
  return _queue;
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const credits = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (credits !== null && credits < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json() as Partial<StreamerPayload>;
  if (!body.projectId || !body.titleText) {
    return NextResponse.json({ error: "projectId and titleText required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.uploadedVideoUrl) {
    return NextResponse.json({ error: "Project has no uploaded video" }, { status: 400 });
  }

  // Atomic double-submit guard (H6, mirrors app/api/generate/compile/route.ts):
  // the findFirst above is a stale snapshot, so two concurrent submits could
  // both pass it and both charge + enqueue. Claiming the status transition is
  // the only race-safe check.
  const claimed = await prisma.project.updateMany({
    where: { id: body.projectId, userId: auth.userId, status: { not: "rendering" } },
    // Clear any previous failureReason with the claim, so the UI never shows a
    // stale reason from the last attempt while this one is running.
    data: { status: "rendering", failureReason: null },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "A render is already in progress for this project." }, { status: 409 });
  }

  const spend = await spendCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    reason: "spend:streamer-video",
    refId: `streamer-video:${body.projectId}`,
  });
  if (!spend.ok) {
    // Release the claim so the user can retry once they top up.
    await prisma.project.update({ where: { id: body.projectId }, data: { status: project.status } }).catch(() => {});
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  getQueue().enqueue(body.projectId, {
    projectId: body.projectId,
    titleText: body.titleText,
    subtitleStyleIndex: body.subtitleStyleIndex ?? 0,
  });
  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "rendering", creditsRemaining: spend.balances.total });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:streamer-video" });
