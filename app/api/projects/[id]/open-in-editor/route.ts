import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildClipDoc } from "@/lib/track-editor-types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await prisma.project.findFirst({
    where: { id, userId: auth.userId },
    select: { videoUrl: true, title: true },
  });
  if (!source) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!source.videoUrl) return NextResponse.json({ error: "Video not ready" }, { status: 409 });

  // Build a 9:16 editor doc seeded with the completed video
  const doc = buildClipDoc(source.videoUrl, 60, "9:16");

  const project = await prisma.project.create({
    data: {
      userId: auth.userId,
      title: source.title,
      uploadedVideoUrl: source.videoUrl,
      videoUrl: source.videoUrl,
      productType: "text-video-edit",
      status: "draft",
      editorDoc: doc as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return NextResponse.json({ projectId: project.id });
}
