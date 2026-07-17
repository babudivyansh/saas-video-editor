import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_DOC_BYTES } from "@/lib/editor/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.project.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["title", "script", "voiceId", "musicUrl", "backgroundUrl", "subtitlesStyle", "uploadedVideoUrl", "editorDoc"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  // Guard the editor timeline doc: cap size and require the expected top-level
  // shape so a bad client can't store arbitrary oversized JSON.
  if ("editorDoc" in data) {
    const doc = data.editorDoc;
    if (doc !== null) {
      if (JSON.stringify(doc).length > MAX_DOC_BYTES) {
        return NextResponse.json({ error: "Editor document too large" }, { status: 413 });
      }
      const d = doc as { version?: unknown; tracks?: unknown };
      if (typeof d !== "object" || d.version !== 1 || typeof d.tracks !== "object") {
        return NextResponse.json({ error: "Invalid editor document" }, { status: 400 });
      }
    }
  }

  // A re-uploaded video invalidates the cached Rekognition face timeline —
  // otherwise auto-clip reframing would silently reuse crop data detected
  // from the previous file.
  if ("uploadedVideoUrl" in data && data.uploadedVideoUrl !== existing.uploadedVideoUrl) {
    data.faceTimeline = null;
  }

  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json({ project });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.project.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
