import { NextRequest, NextResponse } from "next/server";
import { getApiKeyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// Public API — GET /api/v1/projects/{id}/clips: poll a project's analysis
// status and every clip's progress. Mirrors the internal
// app/api/projects/[id]/clips/route.ts response shape exactly, with the
// session-cookie auth swapped for an API key.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiKeyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized — missing or invalid API key" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, status: true, warnings: true, autoClipCaptionStyle: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clips = await prisma.clip.findMany({
    where: { projectId: id },
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { index: "asc" }],
    select: {
      id: true, index: true, title: true, startSec: true, endSec: true, durationSec: true,
      aspectRatio: true, score: true, mood: true, status: true, progress: true,
      videoUrl: true, thumbnailUrl: true, hasCaptions: true,
    },
  });

  return NextResponse.json({
    project: { status: project.status, warnings: project.warnings, captionStyleIndex: project.autoClipCaptionStyle },
    clips,
  });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "apiKey", name: "v1:projects:clips" });
