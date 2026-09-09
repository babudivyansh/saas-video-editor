import { NextRequest, NextResponse } from "next/server";
import { getApiKeyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { env } from "@/lib/env";
import { createRenderQueue } from "@/lib/render-queue";
import { pickJob, type PickPayload } from "@/lib/autoclip-pipeline";
import { REFRAME_PRESETS, ZOOM_STRENGTHS, SPEAKER_MODES, sanitizeReframeEnum, sanitizeReframePercent } from "@/lib/reframe";
import { resolveCaptionCreateInput } from "@/lib/captions/createPayload";
import { estimateRunCost, bandMaxSeconds } from "@/lib/captions/runEstimate";
import { getCaptionRenderPricing } from "@/lib/captions/pricing";
import { isPremiumTemplateId } from "@/lib/caption-templates";
import { getAutoClipPricing } from "@/lib/autoclip-pipeline";
import { getToolConfig } from "@/lib/tool-config";
import { spendCredits, logToolGeneration } from "@/lib/credits";

// Public API — POST /api/v1/clips: start an AutoClip analysis job for an
// existing project (create the project first via POST /api/v1/projects).
// Mirrors app/api/generate/auto-clip/route.ts exactly, with the
// session-cookie auth swapped for an API key — same enqueue, same validation,
// same charging.
//
// ⚠ BREAKING CHANGE for existing integrations: clips no longer stop at a
// "pending_review" state and there is no POST .../clips/confirm step. A run is
// charged here, at submit, and renders straight through. Clients that polled
// for pending_review and then confirmed must drop that step; polling for
// "completed" is unchanged. See app/docs/api.
export const maxDuration = 30;

// createRenderQueue caches by name — this resolves to the SAME queue/worker
// instance app/api/generate/auto-clip/route.ts already created, not a second
// one, regardless of which route module happens to run first.
const pickQueue = createRenderQueue<PickPayload>("auto-clip-pick", pickJob);

async function handlePOST(req: NextRequest) {
  const auth = await getApiKeyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized — missing or invalid API key" }, { status: 401 });
  if (!auth.scopes.includes("write")) {
    return NextResponse.json({ error: "This API key does not have write access" }, { status: 403 });
  }

  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Auto-clip is not configured on this server" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as Partial<PickPayload>;
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

  const claimed = await prisma.project.updateMany({
    where: { id: body.projectId, userId: auth.userId, status: { in: ["draft", "failed"] } },
    data: { status: "analyzing" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Analysis already in progress or already run for this project" }, { status: 409 });
  }

  // Same charge/gate sequence as app/api/generate/auto-clip/route.ts — see that
  // file's header for why it lives here rather than at a confirm step. Kept in
  // step deliberately: these two routes are meant to differ only in how the
  // caller authenticates.
  const release = () =>
    prisma.project.update({ where: { id: body.projectId! }, data: { status: "draft" } }).catch(() => {});

  if (!(await getToolConfig("auto-clip")).enabled) {
    await release();
    return NextResponse.json({ error: "Auto Clips are temporarily disabled." }, { status: 503 });
  }

  const caption = resolveCaptionCreateInput(body);
  const [pricing, captionPricing] = await Promise.all([getAutoClipPricing(), getCaptionRenderPricing()]);
  const estimate = estimateRunCost(
    {
      clipCount: Math.min(body.clipCount ?? 5, 20),
      maxDurationSec: bandMaxSeconds(body.minDuration ?? 15, body.maxDuration ?? 60),
      premiumCaptions: caption.templateId ? isPremiumTemplateId(caption.templateId) : false,
    },
    pricing,
    captionPricing,
  );

  if (estimate.total > 0) {
    const spend = await spendCredits({
      userId: auth.userId,
      amount: estimate.total,
      reason: "spend:auto-clip",
      refId: `auto-clip:${body.projectId}`,
    });
    if (!spend.ok) {
      await release();
      return NextResponse.json(
        { error: "insufficient_credits", required: estimate.total, balance: spend.balances.total },
        { status: 402 },
      );
    }
    void logToolGeneration({
      userId: auth.userId,
      toolSlug: "auto-clip",
      creditsCost: estimate.total,
      generationType: "video",
      refId: `auto-clip:${body.projectId}`,
    });
  }

  pickQueue.enqueue(body.projectId, {
    projectId: body.projectId,
    minDuration: body.minDuration ?? 15,
    maxDuration: body.maxDuration ?? 60,
    clipCount: Math.min(body.clipCount ?? 5, 20),
    aspectRatio: body.aspectRatio ?? "9:16",
    instructions: body.instructions ?? "",
    // Both caption fields resolved together — see lib/captions/createPayload.ts.
    // captionStyleIndex used to be the ONE unsanitized field on this route, and
    // this one is the PUBLIC API surface, so it took arbitrary client input.
    ...resolveCaptionCreateInput(body),
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
  });

  return NextResponse.json({ status: "analyzing", projectId: body.projectId });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "apiKey", name: "v1:clips:create" });
