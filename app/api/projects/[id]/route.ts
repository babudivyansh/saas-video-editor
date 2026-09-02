import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_DOC_BYTES } from "@/lib/editor/types";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";
import { parseS3Url } from "@/lib/s3-url";

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

    // Bind the project to the Asset row backing this URL. The client uploads
    // through /api/upload (which adopts the bytes into the library) and then
    // PATCHes the resulting URL onto the project, so by the time we get here
    // the Asset almost always exists — we just never recorded which one it
    // was, leaving "what did this upload produce?" unanswerable. Resolving by
    // s3Key, scoped to the caller, means a user can't bind someone else's
    // asset by guessing a URL.
    data.sourceAssetId = null;
    if (typeof data.uploadedVideoUrl === "string" && data.uploadedVideoUrl) {
      const loc = parseS3Url(data.uploadedVideoUrl);
      if (loc) {
        const sourceAsset = await prisma.asset.findFirst({
          where: { userId: auth.userId, s3Key: loc.key },
          select: { id: true },
        });
        if (sourceAsset) data.sourceAssetId = sourceAsset.id;
      }
    }
  }

  // Optimistic concurrency, scoped to editor-doc saves only (autosave is the
  // one write path where two tabs/devices can race — other PATCHes here, e.g.
  // AutoClip's title/script updates, aren't part of that flow and keep the
  // simple unconditional update below). The client must send back the
  // editorVersion it last read; a mismatch means a newer save already landed
  // elsewhere, and this request is rejected with 409 rather than silently
  // clobbering it. Project previously had no updatedAt/version column at all,
  // so this was a genuine blind last-write-wins gap, not just an unlikely race.
  if ("editorDoc" in data) {
    const expectedVersion = body.expectedVersion;
    if (typeof expectedVersion !== "number") {
      return NextResponse.json({ error: "expectedVersion required when saving editorDoc" }, { status: 400 });
    }
    const claimed = await prisma.project.updateMany({
      where: { id, userId: auth.userId, editorVersion: expectedVersion },
      data: { ...data, editorVersion: { increment: 1 } },
    });
    if (claimed.count === 0) {
      const current = await prisma.project.findUnique({ where: { id }, select: { editorVersion: true } });
      return NextResponse.json(
        { error: "version_conflict", currentVersion: current?.editorVersion ?? null },
        { status: 409 },
      );
    }
    const project = await prisma.project.findUnique({ where: { id } });
    // Editing bumps updatedAt, which is what the resume rail orders by.
    await invalidateDashboardSummary(auth.userId);
    return NextResponse.json({ project });
  }

  const project = await prisma.project.update({ where: { id }, data });
  await invalidateDashboardSummary(auth.userId);
  return NextResponse.json({ project });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.project.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id } });
  // Without this the 60s-cached summary serves the deleted card straight back
  // on the next load, which reads as the delete having silently failed.
  await invalidateDashboardSummary(auth.userId);
  return NextResponse.json({ success: true });
}
