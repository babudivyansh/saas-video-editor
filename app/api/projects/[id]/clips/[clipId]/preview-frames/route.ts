import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { z } from "zod";
import { renderPreviewFrames } from "@/lib/autoclip-preview";
import { freshSourceUrl } from "@/lib/source-url";
import { liteEditsSchema } from "@/lib/autoclip-lite";

/**
 * Unsaved state the caller wants previewed. Everything is optional — an empty
 * body still previews the saved clip, which is what older clients send.
 */
const previewOverlaySchema = z
  .object({
    liteEdits: liteEditsSchema.optional(),
    startSec: z.number().min(0).max(24 * 3600).optional(),
    endSec: z.number().min(0).max(24 * 3600).optional(),
  })
  .strict();

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

  // Overlay the caller's UNSAVED edits onto an in-memory copy of the clip.
  // Nothing here is persisted — this endpoint spends no credits and writes no
  // rows; it exists so a user can see what a re-render would look like before
  // committing to it. Previously the body was ignored entirely, so it rendered
  // the already-saved state and the preview could never show a pending change.
  const body = await req.json().catch(() => ({}));
  const parsed = previewOverlaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid preview request" },
      { status: 400 },
    );
  }

  const { liteEdits, startSec, endSec } = parsed.data;
  // Trim is only applied when both ends are given and ordered — a half-sent or
  // inverted range would silently preview a different clip than the user sees.
  const trimValid =
    typeof startSec === "number" && typeof endSec === "number" && endSec > startSec;

  const previewClip = {
    ...clip,
    ...(liteEdits ? { liteEdits: liteEdits as unknown as typeof clip.liteEdits } : {}),
    ...(trimValid ? { startSec, endSec, durationSec: endSec - startSec } : {}),
  };

  try {
    // Same stale-presigned-URL defect as Split Screen, Streamer Video and
    // AutoClip P0-3: uploadedVideoUrl is the presigned UPLOAD url (6h), so a
    // preview of any project older than that died on the download with
    // 403 "Request has expired". auth.userId is the proven owner — the
    // findFirst above already scoped the project to them.
    // See docs/stale-presigned-url-cross-product-fix.md.
    const source = await freshSourceUrl(project.uploadedVideoUrl, auth.userId);
    const frames = await renderPreviewFrames(source, previewClip);
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
