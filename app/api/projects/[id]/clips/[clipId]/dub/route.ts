import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { spendCredits, restoreSpend, logToolGeneration } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getUserTier } from "@/lib/auth";
import { tierAtLeast } from "@/lib/plans/tiers";
import { TOOL_COSTS } from "@/lib/tool-costs";
import { getAutoClipPricing } from "@/lib/autoclip-pipeline";
import { getToolConfig } from "@/lib/tool-config";
import { dubStartQueue, computeDubCost } from "@/lib/autoclip-dub";
import { DUB_LANGUAGES } from "@/utils/elevenlabs";

// GET /api/projects/[id]/clips/[clipId]/dub — list dub jobs for a clip.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
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
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
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

  // Claim BEFORE charging. The row is the claim: a clip can have one dub per
  // language in flight, checked and created under a row lock on the clip so
  // two concurrent requests can't both pass the check. This used to charge
  // first under a Date.now() refId with no claim at all, so a double-click
  // bought two ElevenLabs dubs.
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Clip" WHERE id = ${clipId} FOR UPDATE`;
    const inFlight = await tx.clipDub.findFirst({
      where: { clipId, targetLang, status: { in: ["dubbing", "processing"] } },
      select: { id: true },
    });
    if (inFlight) return null;
    return tx.clipDub.create({ data: { clipId, targetLang, status: "dubbing", userId: auth.userId } });
  });
  if (!claimed) {
    return NextResponse.json({ error: "A dub in this language is already in progress for this clip." }, { status: 409 });
  }

  // Deterministic, per dub row — so the webhook, the sweep and the failure
  // paths below all refund exactly this dub and nothing else.
  const refId = `auto-clip-dub:${claimed.id}`;
  const spend = await spendCredits({
    userId: auth.userId,
    amount: creditCost,
    reason: "spend:auto-clip-dub",
    refId,
  });
  if (!spend.ok) {
    await prisma.clipDub.delete({ where: { id: claimed.id } }).catch(() => {});
    return NextResponse.json(
      { error: "insufficient_credits", required: creditCost, balance: spend.balances.total },
      { status: 402 },
    );
  }

  let dub;
  try {
    dub = await prisma.clipDub.update({ where: { id: claimed.id }, data: { refId } });
    // Awaited, and rejecting: credits are already spent, so a dropped enqueue
    // must refund rather than leave a paid dub that never starts.
    await dubStartQueue.enqueue(dub.id, { projectId, clipDubId: dub.id, userId: auth.userId, refId }, { rejectOnFailure: true });
  } catch (e) {
    logger.error("auto-clip-dub", `could not start dub ${claimed.id}; refunding`, e);
    await restoreSpend({ userId: auth.userId, refId, reason: "refund:auto-clip-dub-failed" }).catch(() => {});
    await prisma.clipDub.update({ where: { id: claimed.id }, data: { status: "failed" } }).catch(() => {});
    return NextResponse.json({ error: "Couldn't start the dub right now — you haven't been charged." }, { status: 503 });
  }

  // Ledger rows alone don't reach the AI-spend dashboards — those aggregate
  // Generation. Logged once the dub has actually started.
  void logToolGeneration({
    userId: auth.userId, toolSlug: "clip-dub", creditsCost: creditCost,
    generationType: "audio", refId,
  });

  return NextResponse.json({ dub, creditCost, creditsRemaining: spend.balances.total }, { status: 201 });
}

export const GET = withRateLimit(handleGET, { limit: 120, windowSec: 60, keyBy: "user", name: "auto-clip:dub:list" });
export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "auto-clip:dub" });
