import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getServerAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";

// GET /api/projects/[id]/clips/[clipId]/download
// Streams a single ready clip back through our own origin as an attachment.
//
// The clip's videoUrl points at S3/CDN, a different origin. The browser's
// `download` attribute is spec'd to be ignored on cross-origin links, so the
// per-clip "Download" button was really just navigating to (and playing) the
// video instead of saving it. Proxying it here — same origin, explicit
// Content-Disposition — makes Download actually download, and keeps the S3
// bucket layout private (the user only ever sees our URL).
export const maxDuration = 300;

function safeName(title: string | null, index: number): string {
  const base = (title ?? `clip-${index + 1}`)
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${String(index + 1).padStart(2, "0")}-${base || "clip"}.mp4`;
}

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clipId: string }> },
) {
  // This route is opened by a plain <a download> navigation, which sends the
  // session cookie but not the Authorization header — so fall back to the
  // cookie (getServerAuthUser) when there's no Bearer token, or the click 401s.
  const auth = (await getAuthUser(req)) ?? (await getServerAuthUser());
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  // Ownership is enforced by scoping the clip lookup to a project the caller
  // owns — a clip that isn't theirs (or a bad projectId) simply isn't found.
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, projectId },
    select: { index: true, title: true, videoUrl: true, status: true },
  });
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clip.status !== "ready" || !clip.videoUrl) {
    return NextResponse.json({ error: "Clip is not ready yet" }, { status: 409 });
  }

  try {
    const upstream = await fetch(clip.videoUrl);
    if (!upstream.ok || !upstream.body) {
      logger.warn("auto-clip", `clip download upstream ${upstream.status} for ${clipId}`);
      return NextResponse.json({ error: "Could not fetch the clip" }, { status: 502 });
    }

    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") || "video/mp4",
      "Content-Disposition": `attachment; filename="${safeName(clip.title, clip.index)}"`,
      "Cache-Control": "no-store",
    };
    const len = upstream.headers.get("content-length");
    if (len) headers["Content-Length"] = len;

    // Stream the upstream body straight through — never buffer a whole video in
    // the worker.
    return new NextResponse(upstream.body, { headers });
  } catch (err) {
    logger.error("auto-clip", `clip download failed for ${clipId}`, err);
    return NextResponse.json({ error: "Could not build the download" }, { status: 500 });
  }
}

export const GET = withRateLimit(handleGET, {
  limit: 60, windowSec: 300, keyBy: "user", name: "auto-clip:download-clip",
});
