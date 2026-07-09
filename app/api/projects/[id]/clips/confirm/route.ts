import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createRenderQueue } from "@/lib/render-queue";
import { renderJob, computeCreditCost, getAutoClipPricing, type RenderPayload, type Aspect } from "@/lib/autoclip-pipeline";

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
  const creditCost = computeCreditCost(toKeep.length, totalDurationSec, pricing);

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
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: creditCost } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: creditCost } } });
    await prisma.project.update({ where: { id: projectId }, data: { status: "pending_review" } });
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

  await prisma.$transaction([
    ...toKeep.map((e) => {
      const clip = byId.get(e.id)!;
      return prisma.clip.update({
        where: { id: e.id },
        data: {
          startSec: e.startSec ?? clip.startSec,
          endSec: e.endSec ?? clip.endSec,
          durationSec: (e.endSec ?? clip.endSec) - (e.startSec ?? clip.startSec),
          aspectRatio: e.aspectRatio ?? clip.aspectRatio,
          status: "queued",
        },
      });
    }),
    prisma.clip.deleteMany({ where: { id: { in: [...toDrop, ...unmentionedDrop] } } }),
  ]);

  renderQueue.enqueue(projectId, { projectId });

  return NextResponse.json({ status: "rendering", creditsCharged: creditCost, creditsRemaining: user.credits });
}
