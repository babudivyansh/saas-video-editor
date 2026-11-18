import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { importSourceFromUrl, probeSourceUrl, isAllowedSourceUrl, UNSUPPORTED_LINK_MESSAGE } from "@/lib/url-import";
import { startUrlImport, finishUrlImport, getUrlImportState, describeImportFailure, PROJECT_GONE_MESSAGE } from "@/lib/url-import-jobs";
import { logger } from "@/lib/logger";

// POST /api/projects/[id]/import-url  { url }
// Pulls a source video from a link into the project, instead of requiring an
// upload. GET ?url=... probes it first so the UI can show title and duration
// (and reject an over-length source) before committing to the download.
//
// The web client imports in the background (body.async) and polls
// GET ?status=1; the synchronous form remains for the mobile API and can take
// minutes on a long source, hence the extended maxDuration.
export const maxDuration = 300;

const bodySchema = z.object({ url: z.string().url().max(2000), async: z.boolean().optional() }).strict();

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isAllowedSourceUrl(url)) {
    return NextResponse.json(
      { error: UNSUPPORTED_LINK_MESSAGE },
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

  const tier = await getUserTier(auth.userId);

  // The web client asks for a background import and polls GET ?status=1: a
  // long VOD outlasts the HTTP connection behind the hosting proxy
  // (CLIPIRO-WEB-15, lib/url-import-jobs.ts).
  if (parsed.data.async) {
    await startUrlImport({ url: parsed.data.url, userId: auth.userId, projectId, tier });
    return NextResponse.json({ state: "running" }, { status: 202 });
  }

  // Synchronous: the mobile API (app/api/mobile/v1/jobs) still waits inline.
  try {
    const result = await importSourceFromUrl({ url: parsed.data.url, userId: auth.userId, projectId, tier });
    // Race-safe: the project may have been deleted while this downloaded.
    if (!(await finishUrlImport(projectId, auth.userId, result))) {
      return NextResponse.json({ error: PROJECT_GONE_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({
      url: result.url, title: result.title, durationSec: result.durationSec, bytes: result.bytes,
    });
  } catch (err) {
    const { message, unexpected } = describeImportFailure(err);
    if (!unexpected) return NextResponse.json({ error: message }, { status: 422 });
    logger.error("url-import", `import failed for project ${projectId}`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET ?status=1 — progress of a background import started above.
async function handleStatus(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const s = await getUrlImportState(projectId);
  if (!s) return NextResponse.json({ error: "No import for this project" }, { status: 404 });
  const { userId, ...body } = s;
  if (userId !== auth.userId) return NextResponse.json({ error: "No import for this project" }, { status: 404 });
  return NextResponse.json(body);
}

const probeGET = withRateLimit(handleGET, {
  limit: 30, windowSec: 60, keyBy: "user", name: "auto-clip:import-probe",
});
// Polled every few seconds while an import runs, so its own, looser budget.
const statusGET = withRateLimit(handleStatus, {
  limit: 60, windowSec: 60, keyBy: "user", name: "auto-clip:import-status",
});
export function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return new URL(req.url).searchParams.has("status") ? statusGET(req, ctx) : probeGET(req);
}
// Deliberately tight: each call can pull gigabytes through the server.
export const POST = withRateLimit(handlePOST, {
  limit: 5, windowSec: 300, keyBy: "user", name: "auto-clip:import-url",
});
