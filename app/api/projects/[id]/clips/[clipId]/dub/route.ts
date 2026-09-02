import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { spendCredits, logToolGeneration } from "@/lib/credits";
import { getUserTier } from "@/lib/auth";
import { tierAtLeast } from "@/lib/plans/tiers";
import { TOOL_COSTS } from "@/lib/tool-costs";
import { getAutoClipPricing } from "@/lib/autoclip-pipeline";
import { getToolConfig } from "@/lib/tool-config";
import { dubStartQueue, computeDubCost } from "@/lib/autoclip-dub";
import { DUB_LANGUAGES } from "@/utils/elevenlabs";

// GET /api/projects/[id]/clips/[clipId]/dub — list dub jobs for a clip.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope the clip to this project before reading its dubs — otherwise any
  // project owner could pass a foreign clipId and read that tenant's dub
  // video URLs. The POST below already does this.
  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId }, select: { id: true } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const dubs = await prisma.clipDub.findMany({ where: { clipId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ dubs, languages: DUB_LANGUAGES });
}

// POST /api/projects/[id]/clips/[clipId]/dub { targetLang }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  if (!env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Dubbing is not configured on this server" }, { status: 503 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  if (clip.status !== "ready" || !clip.videoUrl) {
    return NextResponse.json({ error: "Clip must finish rendering before it can be dubbed" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as { targetLang?: string };
  const targetLang = body.targetLang;
  if (!targetLang || !DUB_LANGUAGES.some((l) => l.code === targetLang)) {
    return NextResponse.json({ error: "Invalid or unsupported targetLang" }, { status: 400 });
  }

  if (!(await getToolConfig("clip-dub")).enabled) {
    return NextResponse.json({ error: "Dubbing is temporarily disabled." }, { status: 503 });
  }

  // Pro+ while the ElevenLabs Dubbing per-minute rate is unconfirmed — the same
  // mitigation subtitle-remover and face-swap use for an unknown provider cost.
  const requiredTier = TOOL_COSTS["clip-dub"].requiredTier;
  if (requiredTier && !tierAtLeast(await getUserTier(auth.userId), requiredTier)) {
    return NextResponse.json(
      { error: `Dubbing requires the ${requiredTier} plan or higher.`, requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  // Billed per minute of clip, not per dub: a 3-minute dub and a 10-second one
  // cost us very different amounts and used to charge the same flat 1 credit.
  const pricing = await getAutoClipPricing();
  const creditCost = computeDubCost(clip.durationSec, pricing.dubPerMinute);

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < creditCost) {
    return NextResponse.json({ error: `Insufficient credits (need ${creditCost})` }, { status: 402 });
  }
  const refId = `auto-clip-dub:${clipId}:${Date.now()}`;
  const spend = await spendCredits({
    userId: auth.userId,
    amount: creditCost,
    reason: "spend:auto-clip-dub",
    refId,
  });
  if (!spend.ok) {
    return NextResponse.json({ error: `Insufficient credits (need ${creditCost})` }, { status: 402 });
  }

  // Ledger rows alone don't reach the AI-spend dashboards — those aggregate
  // Generation. Without this the whole AutoClip surface was invisible to margin
  // analytics while being the most expensive thing the product runs.
  void logToolGeneration({
    userId: auth.userId, toolSlug: "clip-dub", creditsCost: creditCost,
    generationType: "audio", refId,
  });

  const dub = await prisma.clipDub.create({ data: { clipId, targetLang, status: "dubbing", userId: auth.userId, refId } });
  dubStartQueue.enqueue(dub.id, { projectId, clipDubId: dub.id, userId: auth.userId, refId });

  return NextResponse.json({ dub, creditCost, creditsRemaining: spend.balances.total }, { status: 201 });
}
