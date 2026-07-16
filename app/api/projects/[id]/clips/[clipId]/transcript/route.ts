import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRenderQueue } from "@/lib/render-queue";
import { rerenderJob, type RerenderPayload } from "@/lib/autoclip-pipeline";
import type { WordTiming } from "@/utils/elevenlabs";

const rerenderQueue = createRenderQueue<RerenderPayload>("auto-clip-rerender", rerenderJob);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { transcript: WordTiming[] };
  if (!Array.isArray(body.transcript)) {
    return NextResponse.json({ error: "Invalid transcript array" }, { status: 400 });
  }

  const claimed = await prisma.clip.updateMany({
    where: { id: clipId, projectId, status: { notIn: ["rendering", "queued"] } },
    data: { status: "queued" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This clip is already rendering or queued" }, { status: 409 });
  }

  await prisma.clip.update({
    where: { id: clipId },
    data: {
      transcriptJson: body.transcript as unknown as Prisma.InputJsonValue,
      status: "queued",
      progress: 0,
    },
  });

  rerenderQueue.enqueue(`${clipId}-${Date.now()}`, { projectId, clipId });

  return NextResponse.json({ status: "queued" });
}
