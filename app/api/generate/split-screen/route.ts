import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { spendCredits, restoreSpend } from "@/lib/credits";
import { markQuestComplete } from "@/lib/quests";
import { firePostCreditSpendEmails, fireZeroCreditsEmail } from "@/lib/credit-events";
import {
  extractAudio,
  generateASS,
  runSplitScreenFFmpeg,
  styleIndexToSubtitleStyle,
} from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { WordTiming } from "@/utils/elevenlabs";
import { transcribe } from "@/lib/transcription";
import { downloadFile } from "@/utils/download";
import os from "os";
import path from "path";
import fs from "fs";
import { InProcessQueue } from "@/lib/job-queue";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { freshSourceUrl } from "@/lib/source-url";

export const maxDuration = 300;

const CREDIT_COST = 1;

// Refund the credit charged at enqueue time when an async render job fails.
async function refundRenderCredit(projectId: string) {
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    await restoreSpend({
      userId: proj.userId,
      refId: `split-screen:${projectId}`,
      amount: CREDIT_COST,
      reason: "refund:split-screen-failed",
    });
  } catch (e) {
    logger.error("refund", `failed to refund credit for project ${projectId}`, e);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SplitScreenPayload {
  projectId: string;
  bgVideoUrl: string;
  subtitleStyleIndex: number;
  mode: "oneword" | "lines";
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// downloadFile is imported from utils/download: it follows redirects and rejects
// on non-200 responses, so an unreachable/404 background URL fails fast with a
// clear error instead of silently writing an HTML error page as the "video".

// ── Job worker ───────────────────────────────────────────────────────────────

async function renderJob(payload: SplitScreenPayload): Promise<void> {
  const { projectId, bgVideoUrl, subtitleStyleIndex, mode } = payload;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.uploadedVideoUrl) {
    throw new Error(`Project ${projectId} missing uploadedVideoUrl`);
  }

  const tmp = os.tmpdir();
  const userPath  = path.join(tmp, `${projectId}-user.mp4`);
  const bgPath    = path.join(tmp, `${projectId}-bg.mp4`);
  const audioPath = path.join(tmp, `${projectId}-audio.mp3`);
  const assPath   = path.join(tmp, `${projectId}.ass`);
  const outPath   = path.join(tmp, `${projectId}-output.mp4`);

  try {
    // Project.uploadedVideoUrl is the PRESIGNED upload URL (6h lifetime), not a
    // durable identity — reusing it made every project older than six hours fail
    // with 403 "Request has expired". Re-mint from the owned S3 key instead.
    // Same defect and same shared resolver as the AutoClip P0-3 incident; see
    // docs/stale-presigned-url-cross-product-fix.md.
    await Promise.all([
      downloadFile(await freshSourceUrl(project.uploadedVideoUrl, project.userId), userPath),
      downloadFile(bgVideoUrl, bgPath),
    ]);

    await extractAudio(userPath, audioPath);

    let wordTimings: WordTiming[] = [];
    try {
      wordTimings = await transcribe(fs.readFileSync(audioPath));
    } catch (err) {
      logger.warn("split-screen", "transcription failed, rendering without subtitles", err);
    }

    const subtitleStyle = styleIndexToSubtitleStyle(subtitleStyleIndex, mode);
    generateASS(wordTimings, subtitleStyle, assPath);

    await runSplitScreenFFmpeg({ userVideoPath: userPath, bgVideoPath: bgPath, assPath, outputPath: outPath });

    const s3Key = `renders/${projectId}.mp4`;
    const videoUrl = await uploadFileToS3(outPath, s3Key, "video/mp4");

    await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl } });
  } catch (err) {
    logger.error("split-screen", `render failed for ${projectId}`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    await refundRenderCredit(projectId);
  } finally {
    for (const f of [userPath, bgPath, audioPath, assPath, outPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}

// Lazy singleton queue
let _queue: InProcessQueue<SplitScreenPayload> | null = null;
function getQueue() {
  if (!_queue) _queue = new InProcessQueue<SplitScreenPayload>("split-screen", renderJob);
  return _queue;
}

// ── Route handler ────────────────────────────────────────────────────────────

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const credits = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (credits !== null && credits < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json() as Partial<SplitScreenPayload>;
  if (!body.projectId || !body.bgVideoUrl) {
    return NextResponse.json({ error: "projectId and bgVideoUrl required" }, { status: 400 });
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
    data: { status: "rendering" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "A render is already in progress for this project." }, { status: 409 });
  }

  const spend = await spendCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    reason: "spend:split-screen",
    refId: `split-screen:${body.projectId}`,
  });
  if (!spend.ok) {
    // Release the claim so the user can retry once they top up.
    await prisma.project.update({ where: { id: body.projectId }, data: { status: project.status } }).catch(() => {});
    fireZeroCreditsEmail(auth.userId);
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  firePostCreditSpendEmails(auth.userId, spend.balances.total);

  getQueue().enqueue(body.projectId, {
    projectId: body.projectId,
    bgVideoUrl: body.bgVideoUrl,
    subtitleStyleIndex: body.subtitleStyleIndex ?? 0,
    mode: body.mode ?? "oneword",
  });
  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "rendering", creditsRemaining: spend.balances.total });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:split-screen" });
