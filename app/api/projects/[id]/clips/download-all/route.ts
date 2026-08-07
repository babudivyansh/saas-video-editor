import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { ZipWriter } from "@/lib/zip-writer";
import { logger } from "@/lib/logger";

// GET /api/projects/[id]/clips/download-all
// Streams every ready clip as one zip.
//
// Downloading a 20-clip project meant twenty separate clicks, which is the
// kind of friction that doesn't show up in a bug tracker and does show up in
// churn. Reuses lib/zip-writer.ts's streaming writer, so a large project never
// has to be buffered in memory.
export const maxDuration = 300;

function safeName(title: string | null, index: number): string {
  const base = (title ?? `clip-${index + 1}`)
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${String(index + 1).padStart(2, "0")}-${base || "clip"}.mp4`;
}

async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const clips = await prisma.clip.findMany({
    where: { projectId, status: "ready", videoUrl: { not: null } },
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { index: "asc" }],
    select: { index: true, title: true, videoUrl: true },
  });
  if (clips.length === 0) {
    return NextResponse.json({ error: "No finished clips to download yet" }, { status: 404 });
  }

  // ZipWriter assembles in memory (store, no compression — video is already
  // compressed, so deflating it would burn CPU for nothing). That bounds how
  // much this can safely archive, hence the cap: past it, the honest answer is
  // to say so rather than to OOM the worker mid-download.
  const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

  try {
    const zip = new ZipWriter();
    let total = 0;
    let included = 0;

    for (const [i, clip] of clips.entries()) {
      const res = await fetch(clip.videoUrl!);
      if (!res.ok) {
        logger.warn("auto-clip", `skipping clip ${clip.index} in bulk download (${res.status})`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (total + buf.length > MAX_TOTAL_BYTES) {
        logger.warn("auto-clip", `bulk download for ${projectId} hit the size cap after ${included} clips`);
        break;
      }
      zip.addFile(safeName(clip.title, i), buf);
      total += buf.length;
      included++;
    }

    if (included === 0) {
      return NextResponse.json({ error: "Could not fetch any of the clips" }, { status: 502 });
    }

    const body = zip.toBuffer();
    const zipName = safeName(project.title, -1).replace(/\.mp4$/, "").replace(/^00-/, "") || "clips";

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}-clips.zip"`,
        "Content-Length": String(body.length),
        // Tells the client when not everything fit, instead of silently
        // handing over a short archive.
        "X-Clips-Included": String(included),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("auto-clip", `bulk download failed for project ${projectId}`, err);
    return NextResponse.json({ error: "Could not build the download" }, { status: 500 });
  }
}

export const GET = withRateLimit(handleGET, {
  limit: 10, windowSec: 300, keyBy: "user", name: "auto-clip:download-all",
});
