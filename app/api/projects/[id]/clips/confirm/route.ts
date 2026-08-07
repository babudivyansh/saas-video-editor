import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { tierPriority } from "@/lib/plans/tiers";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createRenderQueue } from "@/lib/render-queue";
import { logger } from "@/lib/logger";
import { spendCredits, restoreSpend } from "@/lib/credits";
import { renderJob, computeCreditCost, getAutoClipPricing, getAnalysisCreditsPaid, type RenderPayload, type Aspect } from "@/lib/autoclip-pipeline";

const renderQueue = createRenderQueue<RenderPayload>("auto-clip-render", renderJob);

const ASPECTS: Aspect[] = ["9:16", "16:9", "1:1"];

interface ClipEdit {
  id: string;
  keep: boolean;
  startSec?: number;
  endSec?: number;
  aspectRatio?: Aspect;
}

// POST /api/projects/[id]/clips/confirm
// The review step (P1.2): the user has seen the AI's picks and may have
// trimmed in/out points, dropped clips they don't want, or changed a clip's
// aspect ratio (P1.4). Credits are charged here — after the user has actually
// agreed to render something — not at the initial "analyze" step, so nobody
// pays for picks they reject.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.status !== "pending_review") {
    return NextResponse.json({ error: `Project is not awaiting review (status: ${project.status})` }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as { clips?: ClipEdit[] };
  const edits = Array.isArray(body.clips) ? body.clips : null;
  if (!edits || edits.length === 0) {
    return NextResponse.json({ error: "clips array required" }, { status: 400 });
  }

  const existing = await prisma.clip.findMany({ where: { projectId, status: "pending_review" } });
  const existingIds = new Set(existing.map((c) => c.id));

  const toKeep = edits.filter((e) => e.keep && existingIds.has(e.id));
  const toDrop = edits.filter((e) => !e.keep && existingIds.has(e.id)).map((e) => e.id);
  // Any pending_review clip not mentioned at all is treated as dropped too.
  const mentioned = new Set(edits.map((e) => e.id));
  const unmentionedDrop = existing.filter((c) => !mentioned.has(c.id)).map((c) => c.id);

  if (toKeep.length === 0) {
    return NextResponse.json({ error: "At least one clip must be kept" }, { status: 400 });
  }

  // Validate + apply overrides for kept clips.
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const e of toKeep) {
    const clip = byId.get(e.id)!;
    const start = e.startSec ?? clip.startSec;
    const end = e.endSec ?? clip.endSec;
    if (typeof start !== "number" || typeof end !== "number" || end <= start || start < 0) {
      return NextResponse.json({ error: `Invalid start/end for clip ${e.id}` }, { status: 400 });
    }
    if (end - start > 300) {
      return NextResponse.json({ error: `Clip ${e.id} exceeds the 300s max clip length` }, { status: 400 });
    }
    if (e.aspectRatio && !ASPECTS.includes(e.aspectRatio)) {
      return NextResponse.json({ error: `Invalid aspectRatio for clip ${e.id}` }, { status: 400 });
    }
  }

  const totalDurationSec = toKeep.reduce((s, e) => {
    const clip = byId.get(e.id)!;
    return s + ((e.endSec ?? clip.endSec) - (e.startSec ?? clip.startSec));
  }, 0);
  const pricing = await getAutoClipPricing();
  // The analysis charge paid at the pick step is credited back here, so a
  // user who confirms pays only the clip pricing ("you only pay for clips
  // you keep" — analysis is free unless you walk away).
  const grossCost = computeCreditCost(toKeep.length, totalDurationSec, pricing);
  const analysisPaid = await getAnalysisCreditsPaid(auth.userId, projectId);
  const creditCost = Math.max(grossCost - analysisPaid, 0);

  // Atomic double-submit guard (H6 pattern, see app/api/generate/compile/route.ts)
  // — the earlier findFirst read is a stale snapshot; two concurrent confirms
  // could both pass it and both charge credits + enqueue a render. The status
  // transition itself is the only safe check.
  const claimed = await prisma.project.updateMany({
    where: { id: projectId, userId: auth.userId, status: "pending_review" },
    data: { status: "rendering" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This project has already been confirmed" }, { status: 409 });
  }

  // Fast-path credit check via Redis cache.
  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < creditCost) {
    await prisma.project.update({ where: { id: projectId }, data: { status: "pending_review" } });
    return NextResponse.json({ error: "insufficient_credits", required: creditCost, balance: cached }, { status: 402 });
  }

  // Bucket-aware atomic spend; refId `auto-clip:{projectId}` is what the
  // pipeline's partial-failure refund restores against.
  const spend = await spendCredits({
    userId: auth.userId,
    amount: creditCost,
    reason: "spend:auto-clip",
    refId: `auto-clip:${projectId}`,
  });
  if (!spend.ok) {
    await prisma.project.update({ where: { id: projectId }, data: { status: "pending_review" } });
    return NextResponse.json(
      { error: "insufficient_credits", required: creditCost, balance: spend.balances.total },
      { status: 402 },
    );
  }

  await prisma.$transaction([
    ...toKeep.map((e) => {
      const clip = byId.get(e.id)!;
      const startSec = e.startSec ?? clip.startSec;
      const endSec = e.endSec ?? clip.endSec;
      const aspectRatio = e.aspectRatio ?? clip.aspectRatio;
      // Crop keyframes were computed at pick time against the ORIGINAL aspect's
      // crop window (and the original in/out points). Reviewing can change
      // either. Reusing a 9:16 pan path under a 16:9 window mis-frames the
      // subject and can push the crop window past the edge of the source, which
      // ffmpeg rejects outright — failing a clip the user has already paid for.
      // Dropping them falls back to the static centre crop, which is always
      // valid; rerenderJob recomputes a fresh path from the cached
      // Project.faceTimeline anyway.
      const framingChanged =
        aspectRatio !== clip.aspectRatio || startSec !== clip.startSec || endSec !== clip.endSec;
      return prisma.clip.update({
        where: { id: e.id },
        data: {
          startSec,
          endSec,
          durationSec: endSec - startSec,
          aspectRatio,
          status: "queued",
          ...(framingChanged ? { cropKeyframes: Prisma.JsonNull } : {}),
        },
      });
    }),
    prisma.clip.deleteMany({ where: { id: { in: [...toDrop, ...unmentionedDrop] } } }),
  ]);

  // Credits are already spent at this point, so a failed enqueue must not be
  // silent: previously this was fire-and-forget, and a Redis outage left the
  // user charged with nothing rendering and no error anywhere.
  try {
    await renderQueue.enqueue(projectId, { projectId }, { priority: tierPriority(await getUserTier(auth.userId)) });
  } catch (err) {
    logger.error("auto-clip", `failed to enqueue render for ${projectId}, refunding`, err);
    if (creditCost > 0) {
      await restoreSpend({
        userId: auth.userId,
        refId: `auto-clip:${projectId}`,
        amount: creditCost,
        reason: "refund:auto-clip-enqueue-failed",
      }).catch(() => {});
    }
    await prisma.$transaction([
      prisma.clip.updateMany({ where: { projectId, status: "queued" }, data: { status: "pending_review" } }),
      prisma.project.update({ where: { id: projectId }, data: { status: "pending_review" } }),
    ]).catch(() => {});
    return NextResponse.json(
      { error: "Could not start the render — your credits have not been charged. Please try again." },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: "rendering", creditsCharged: creditCost, creditsRemaining: spend.balances.total });
}
