import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { importSourceFromUrl, UrlImportError, probeSourceUrl, isAllowedSourceUrl } from "@/lib/url-import";
import { logger } from "@/lib/logger";

// POST /api/projects/[id]/import-url  { url }
// Pulls a source video from a link into the project, instead of requiring an
// upload. GET ?url=... probes it first so the UI can show title and duration
// (and reject an over-length source) before committing to the download.
//
// Downloads run inline and can take minutes on a long source, hence the
// extended maxDuration.
export const maxDuration = 300;

const bodySchema = z.object({ url: z.string().url().max(2000) }).strict();

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isAllowedSourceUrl(url)) {
    return NextResponse.json(
      { error: "That link isn't supported. Paste a YouTube, Vimeo, Loom, Drive or Dropbox URL." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await probeSourceUrl(url));
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that link. It may be private, region-locked, or removed." },
      { status: 422 },
    );
  }
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A video URL is required" }, { status: 400 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true, status: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  // Replacing the source of a project that's already been analysed would
  // orphan its clips and its cached face timeline.
  if (project.status !== "draft") {
    return NextResponse.json({ error: "This project already has a source video" }, { status: 409 });
  }

  try {
    const tier = await getUserTier(auth.userId);
    const result = await importSourceFromUrl({ url: parsed.data.url, userId: auth.userId, projectId, tier });

    await prisma.project.update({
      where: { id: projectId },
      data: { uploadedVideoUrl: result.url, title: result.title },
    });

    return NextResponse.json({
      url: result.url, title: result.title, durationSec: result.durationSec, bytes: result.bytes,
    });
  } catch (err) {
    if (err instanceof UrlImportError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logger.error("url-import", `import failed for project ${projectId}`, err);
    return NextResponse.json({ error: "Import failed — please try again" }, { status: 500 });
  }
}

export const GET = withRateLimit(handleGET, {
  limit: 30, windowSec: 60, keyBy: "user", name: "auto-clip:import-probe",
});
// Deliberately tight: each call can pull gigabytes through the server.
export const POST = withRateLimit(handlePOST, {
  limit: 5, windowSec: 300, keyBy: "user", name: "auto-clip:import-url",
});
