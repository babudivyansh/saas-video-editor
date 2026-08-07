import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { FREE_TIER_AUTOCLIP_RUNS_PER_MONTH, tierPriority } from "@/lib/plans/tiers";
import { markQuestComplete } from "@/lib/quests";
import { withRateLimit } from "@/lib/with-rate-limit";
import { env } from "@/lib/env";
import { createRenderQueue } from "@/lib/render-queue";
import { pickJob, type PickPayload } from "@/lib/autoclip-pipeline";
import { REFRAME_PRESETS, ZOOM_STRENGTHS, SPEAKER_MODES, sanitizeReframeEnum, sanitizeReframePercent } from "@/lib/reframe";

// The actual analysis (download, transcribe, Rekognition, Gemini) now runs on
// a durable BullMQ-backed queue (see lib/render-queue.ts) instead of blocking
// this request — so this handler only needs to validate and enqueue. No
// credits are charged here: charging moved to the confirm step (P1.2), after
// the user has reviewed the AI's picks, so nobody pays for clips they reject.
export const maxDuration = 30;

const pickQueue = createRenderQueue<PickPayload>("auto-clip-pick", pickJob);

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Auto-clip is not configured on this server" }, { status: 503 });
  }

  const body = await req.json() as Partial<PickPayload>;
  if (!body.projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.uploadedVideoUrl) {
    return NextResponse.json({ error: "Project has no uploaded video" }, { status: 400 });
  }

  // Free tier gets a small watermarked Auto Clips allowance (rolling 30 days)
  // so the core product is tasteable before paying.
  const tier = await getUserTier(auth.userId);
  if (tier === "free") {
    const { allowed } = await rateLimit(
      `autoclip-free:${auth.userId}`,
      FREE_TIER_AUTOCLIP_RUNS_PER_MONTH,
      30 * 86400,
    );
    if (!allowed) {
      return NextResponse.json(
        {
          error: "free_limit_reached",
          message: `You've used your ${FREE_TIER_AUTOCLIP_RUNS_PER_MONTH} free Auto Clip videos this month. Upgrade for unlimited, watermark-free clips.`,
          upgradeUrl: "/pricing",
        },
        { status: 402 },
      );
    }
  }

  // Atomic double-submit guard (H6 pattern, see app/api/generate/compile/route.ts)
  // — a stale findFirst read above can't itself be the guard since two
  // concurrent requests would both see the same pre-transition status; the
  // transition itself has to be the check, or a double-click analyzes twice
  // and creates duplicate Clip rows.
  const claimed = await prisma.project.updateMany({
    where: { id: body.projectId, userId: auth.userId, status: { in: ["draft", "failed"] } },
    // Clear any previous attempt's error so a retry doesn't show a stale banner.
    data: { status: "analyzing", failureReason: null },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Analysis already in progress or already run for this project" }, { status: 409 });
  }

  pickQueue.enqueue(body.projectId, {
    projectId: body.projectId,
    minDuration: body.minDuration ?? 15,
    maxDuration: body.maxDuration ?? 60,
    clipCount: Math.min(body.clipCount ?? 5, 20),
    aspectRatio: body.aspectRatio ?? "9:16",
    instructions: body.instructions ?? "",
    captionStyleIndex: body.captionStyleIndex ?? 0,
    reframingPreset: sanitizeReframeEnum(body.reframingPreset, REFRAME_PRESETS) ?? "balanced",
    removeSilence: body.removeSilence ?? false,
    silenceThresholdMs: body.silenceThresholdMs ?? 400,
    removeFillers: body.removeFillers ?? false,
    smartAutoReframe: body.smartAutoReframe !== false,
    zoomStrength: sanitizeReframeEnum(body.zoomStrength, ZOOM_STRENGTHS) ?? "medium",
    speakerMode: sanitizeReframeEnum(body.speakerMode, SPEAKER_MODES) ?? "auto",
    smoothness: sanitizeReframePercent(body.smoothness) ?? 50,
    trackingSpeed: sanitizeReframePercent(body.trackingSpeed) ?? 50,
    animatedCaptions: body.animatedCaptions ?? false,
  }, { priority: tierPriority(tier) });

  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "analyzing" });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:auto-clip" });
