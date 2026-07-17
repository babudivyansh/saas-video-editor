import { NextRequest, NextResponse } from "next/server";
import { getApiKeyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { env } from "@/lib/env";
import { createRenderQueue } from "@/lib/render-queue";
import { pickJob, type PickPayload } from "@/lib/autoclip-pipeline";
import { REFRAME_PRESETS, ZOOM_STRENGTHS, SPEAKER_MODES, sanitizeReframeEnum, sanitizeReframePercent } from "@/lib/reframe";

// Public API — POST /api/v1/clips: start an AutoClip analysis job for an
// existing project (create the project first via POST /api/v1/projects... —
// not built yet; for now, projectId must come from a project created in the
// dashboard). Mirrors app/api/generate/auto-clip/route.ts exactly, with the
// session-cookie auth swapped for an API key — same enqueue, same validation,
// same "no credits charged until confirm" behavior.
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
  });

  return NextResponse.json({ status: "analyzing", projectId: body.projectId });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "apiKey", name: "v1:clips:create" });
