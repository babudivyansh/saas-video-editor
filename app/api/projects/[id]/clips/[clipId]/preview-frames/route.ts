import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { renderPreviewFrames } from "@/lib/autoclip-preview";
import { freshSourceUrl } from "@/lib/source-url";

// POST /api/projects/[id]/clips/[clipId]/preview-frames
//
// Renders three still frames — start, middle, end — through the EXACT filter
// graph the real render will use, and returns them as data URLs.
//
// This exists because the review and editing steps otherwise ask the user to
// pay for a render they cannot see. The alternative approaches both lie: the
// source-video preview shows none of the reframing, captions, grade or
// watermark, and a DOM-composited preview would be a hand-reimplementation of
// ffmpeg's filter semantics that drifts from the renderer silently. Three real
// frames are ground truth.
//
// Cheap by construction: -frames:v 1 per timestamp at preview resolution, no
// encode, no audio, no S3, no credits. Rate-limited because it is still three
// ffmpeg invocations.
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true, uploadedVideoUrl: true },
  });
  if (!project?.uploadedVideoUrl) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  try {
    // Same stale-presigned-URL defect as Split Screen, Streamer Video and
    // AutoClip P0-3: uploadedVideoUrl is the presigned UPLOAD url (6h), so a
    // preview of any project older than that died on the download with
    // 403 "Request has expired". auth.userId is the proven owner — the
    // findFirst above already scoped the project to them.
    // See docs/stale-presigned-url-cross-product-fix.md.
    const source = await freshSourceUrl(project.uploadedVideoUrl, auth.userId);
    const frames = await renderPreviewFrames(source, clip);
    if (frames.length === 0) {
      return NextResponse.json({ error: "Could not generate a preview for this clip" }, { status: 503 });
    }
    return NextResponse.json({ frames });
  } catch {
    return NextResponse.json({ error: "Could not generate a preview for this clip" }, { status: 503 });
  }
}

export const POST = withRateLimit(handlePOST, {
  limit: 12, windowSec: 60, keyBy: "user", name: "auto-clip:preview-frames",
});
