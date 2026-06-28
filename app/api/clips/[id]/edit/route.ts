import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildClipDoc, type TrackAspect } from "@/lib/track-editor-types";

const ASPECTS: TrackAspect[] = ["9:16", "16:9", "1:1", "4:5"];

// "Open in Editor": create a new project whose editorDoc is a v2 TrackDoc seeded
// with this clip, so the Advanced Editor opens it on the timeline.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const clip = await prisma.clip.findFirst({ where: { id, project: { userId: auth.userId } } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  if (!clip.videoUrl) return NextResponse.json({ error: "Clip is not ready yet" }, { status: 409 });

  const aspect: TrackAspect = ASPECTS.includes(clip.aspectRatio as TrackAspect)
    ? (clip.aspectRatio as TrackAspect)
    : "9:16";
  const doc = buildClipDoc(clip.videoUrl, clip.durationSec, aspect);

  const project = await prisma.project.create({
    data: {
      userId: auth.userId,
      title: clip.title || "Auto clip",
      uploadedVideoUrl: clip.videoUrl,
      videoUrl: clip.videoUrl,
      productType: "auto-clip-edit",
      status: "draft",
      editorDoc: doc as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return NextResponse.json({ projectId: project.id });
}
