import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRenderProgress } from "@/lib/render-queue";

// Live render progress for the export modal. Combines the DB project status
// (source of truth for completed/failed + the output URL) with the Redis
// stage/percent published by the render worker. Sibling of /api/editor/render.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { status: true, videoUrl: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const progress = await getRenderProgress(projectId);

  let percent = progress?.percent ?? 0;
  let stage = progress?.stage ?? "queued";
  if (project.status === "completed") { percent = 100; stage = "completed"; }
  else if (project.status === "failed") { percent = 0; stage = "failed"; }

  return NextResponse.json({ status: project.status, stage, percent, videoUrl: project.videoUrl });
}
