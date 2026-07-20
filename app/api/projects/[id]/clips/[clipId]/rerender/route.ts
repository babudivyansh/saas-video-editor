import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createRenderQueue } from "@/lib/render-queue";
import { spendCredits, getBalances } from "@/lib/credits";
import {
  rerenderJob, getAutoClipPricing, rebaseClipWords,
  type RerenderPayload, type Aspect,
} from "@/lib/autoclip-pipeline";
import type { WordTiming } from "@/utils/elevenlabs";

const rerenderQueue = createRenderQueue<RerenderPayload>("auto-clip-rerender", rerenderJob);

const ASPECTS: Aspect[] = ["9:16", "16:9", "1:1"];

// POST /api/projects/[id]/clips/[clipId]/rerender
// Re-cuts a single already-rendered clip with new in/out points, caption
// style, or aspect ratio — without re-running transcription, Gemini, or
// Rekognition (all reused from the clip's persisted transcriptJson/
// cropKeyframes). Flat, cheap credit cost since it's one clip, not a batch.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    startSec?: number; endSec?: number; aspectRatio?: Aspect; captionStyleIndex?: number;
  };

  const start = body.startSec ?? clip.startSec;
  const end = body.endSec ?? clip.endSec;
  if (typeof start !== "number" || typeof end !== "number" || end <= start || start < 0 || end - start > 300) {
    return NextResponse.json({ error: "Invalid start/end" }, { status: 400 });
  }
  if (body.aspectRatio && !ASPECTS.includes(body.aspectRatio)) {
    return NextResponse.json({ error: "Invalid aspectRatio" }, { status: 400 });
  }

  // Atomic double-submit guard (H6 pattern) — claim the clip before charging
  // credits so two rapid clicks on "Re-render" can't both charge and enqueue.
  const claimed = await prisma.clip.updateMany({
    where: { id: clipId, projectId, status: { notIn: ["rendering", "queued"] } },
    data: { status: "queued" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This clip is already rendering or queued" }, { status: 409 });
  }

  // First re-render of each clip is free (caption/style tweaks are where
  // delight lives — don't tax the first iteration); charged after that.
  const pricing = await getAutoClipPricing();
  const rerenderCost = clip.rerenderCount === 0 ? 0 : pricing.rerender;
  if (rerenderCost > 0) {
    const cachedCredits = await redis.get(`credits:${auth.userId}`);
    const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
    if (cached !== null && cached < rerenderCost) {
      await prisma.clip.update({ where: { id: clipId }, data: { status: clip.status } });
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const spend = await spendCredits({
      userId: auth.userId,
      amount: rerenderCost,
      reason: "spend:auto-clip-rerender",
      refId: `auto-clip-rerender:${clipId}:${Date.now()}`,
    });
    if (!spend.ok) {
      await prisma.clip.update({ where: { id: clipId }, data: { status: clip.status } });
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }
  }
  await prisma.clip.update({ where: { id: clipId }, data: { rerenderCount: { increment: 1 } } });

  const startChanged = start !== clip.startSec || end !== clip.endSec;
  const newCaptionIndex = body.captionStyleIndex ?? clip.captionStyleIndex;

  let transcriptPatch: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  let hasCaptions = newCaptionIndex != null ? newCaptionIndex >= 0 : clip.hasCaptions;
  if (startChanged && clip.transcriptJson) {
    const rebased = rebaseClipWords(clip.transcriptJson as unknown as WordTiming[], clip.startSec, start, end);
    transcriptPatch = rebased as unknown as Prisma.InputJsonValue;
    hasCaptions = hasCaptions && rebased.length > 0;
  }

  await prisma.clip.update({
    where: { id: clipId },
    data: {
      startSec: start,
      endSec: end,
      durationSec: end - start,
      aspectRatio: body.aspectRatio ?? clip.aspectRatio,
      captionStyleIndex: newCaptionIndex,
      hasCaptions,
      ...(transcriptPatch !== undefined ? { transcriptJson: transcriptPatch } : {}),
      // Crop keyframes are indexed by the old clip-relative time — a changed
      // range invalidates them, so fall back to a static crop for this render
      // rather than risk misaligned panning.
      ...(startChanged ? { cropKeyframes: Prisma.JsonNull } : {}),
      status: "queued",
      progress: 0,
    },
  });

  rerenderQueue.enqueue(`${clipId}-${Date.now()}`, { projectId, clipId });

  const balances = await getBalances(auth.userId);
  return NextResponse.json({ status: "queued", creditsCharged: rerenderCost, creditsRemaining: balances.total });
}
