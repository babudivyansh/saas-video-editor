import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Poll target for the Auto Clip results grid: the project status + every clip
// with its live status/progress, sorted by virality score (highest first).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      aspectRatio: true, score: true, scoreBreakdown: true, mood: true, status: true, progress: true,
      videoUrl: true, thumbnailUrl: true, hasCaptions: true, captionStyleIndex: true, brollQuery: true,
    },
  });

  return NextResponse.json({
    project: { status: project.status, warnings: project.warnings, captionStyleIndex: project.autoClipCaptionStyle },
    clips,
  });
}
