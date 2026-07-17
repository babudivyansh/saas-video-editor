import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRenderQueue } from "@/lib/render-queue";
import { rerenderJob, type RerenderPayload } from "@/lib/autoclip-pipeline";
import { REFRAME_PRESETS, ZOOM_STRENGTHS, SPEAKER_MODES, sanitizeReframeEnum, sanitizeReframePercent } from "@/lib/reframe";

const rerenderQueue = createRenderQueue<RerenderPayload>("auto-clip-rerender", rerenderJob);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    subtitleStyleOverride?: Record<string, unknown>;
    silenceSettings?: Record<string, unknown>;
  };

  const claimed = await prisma.clip.updateMany({
    where: { id: clipId, projectId, status: { notIn: ["rendering", "queued"] } },
    data: { status: "queued" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This clip is already rendering or queued" }, { status: 409 });
  }

  // Drop (rather than default) any reframe field that fails validation, so an
  // invalid value from the client is ignored instead of silently overwriting
  // the clip's existing setting with a fallback the user didn't choose.
  const sanitizedIncomingSilence = { ...body.silenceSettings };
  for (const [key, allowed] of [
    ["reframingPreset", REFRAME_PRESETS],
    ["zoomStrength", ZOOM_STRENGTHS],
    ["speakerMode", SPEAKER_MODES],
  ] as const) {
    if (key in sanitizedIncomingSilence) {
      const validated = sanitizeReframeEnum(sanitizedIncomingSilence[key], allowed);
      if (validated === undefined) delete sanitizedIncomingSilence[key];
      else sanitizedIncomingSilence[key] = validated;
    }
  }
  for (const key of ["smoothness", "trackingSpeed"] as const) {
    if (key in sanitizedIncomingSilence) {
      const validated = sanitizeReframePercent(sanitizedIncomingSilence[key]);
      if (validated === undefined) delete sanitizedIncomingSilence[key];
      else sanitizedIncomingSilence[key] = validated;
    }
  }

  const existingSilence = (clip.silenceSettings as Record<string, unknown>) ?? {};
  const newSilence = body.silenceSettings
    ? { ...existingSilence, ...sanitizedIncomingSilence }
    : existingSilence;

  const existingStyle = (clip.subtitleStyleOverride as Record<string, unknown>) ?? {};
  const newStyle = body.subtitleStyleOverride
    ? { ...existingStyle, ...body.subtitleStyleOverride }
    : existingStyle;

  await prisma.clip.update({
    where: { id: clipId },
    data: {
      subtitleStyleOverride: newStyle as Prisma.InputJsonValue,
      silenceSettings: newSilence as Prisma.InputJsonValue,
      status: "queued",
      progress: 0,
    },
  });

  rerenderQueue.enqueue(`${clipId}-${Date.now()}`, { projectId, clipId });

  return NextResponse.json({ status: "queued" });
}
