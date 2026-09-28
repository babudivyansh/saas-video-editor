import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { tierPriority } from "@/lib/plans/tiers";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withRateLimit } from "@/lib/with-rate-limit";
import { createRenderQueue } from "@/lib/render-queue";
import { normalizeDoc, validateDoc, type TimelineDoc } from "@/lib/editor/types";
import {
  editorRenderJob,
  EDITOR_RENDER_CREDIT_COST,
  type EditorRenderPayload,
} from "@/lib/editor/render-job";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { restoreSpend, spendCredits } from "@/lib/credits";
import { ffmpegBin } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";
import {
  getRenderRuntimeHealth,
  RENDER_RUNTIME_UNHEALTHY,
  RENDER_RUNTIME_UNAVAILABLE_MESSAGE,
} from "@/lib/render-runtime";

const renderQueue = createRenderQueue<EditorRenderPayload>("editor-render", editorRenderJob);

// POST /api/editor/render { projectId }
// Renders the project's saved editorDoc. Credit + refund pattern mirrors
// app/api/generate/compile. The doc and its assets are re-validated and
// re-resolved server-side — client URLs are never trusted.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const projectId = body.projectId as string | undefined;
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  // Cheap early-out only. The real double-submit guard is the atomic claim
  // below: this read is a snapshot, and two clicks can both pass it.
  if (project.status === "rendering") {
    return NextResponse.json({ error: "Project is already rendering" }, { status: 409 });
  }

  // Validate the saved timeline document.
  const raw = project.editorDoc as unknown as TimelineDoc | null;
  if (!raw) return NextResponse.json({ error: "Nothing to export yet" }, { status: 400 });
  const doc = normalizeDoc(raw); // backfills track arrays missing from an older saved doc (e.g. no caption track)
  const docError = validateDoc(doc);
  if (docError) return NextResponse.json({ error: `Invalid timeline: ${docError}` }, { status: 400 });
  if (doc.tracks.video.length === 0) {
    return NextResponse.json({ error: "Add at least one video clip before exporting" }, { status: 400 });
  }

  // Resolve every referenced asset and confirm ownership.
  const assetIds = [
    ...new Set([
      ...doc.tracks.video.map((c) => c.assetId),
      ...doc.tracks.audio.map((c) => c.assetId),
      ...doc.tracks.image.map((c) => c.assetId),
    ]),
  ];
  const assets = await prisma.asset.findMany({ where: { id: { in: assetIds }, userId: auth.userId } });
  if (assets.length !== assetIds.length) {
    return NextResponse.json({ error: "One or more media files are missing from your library" }, { status: 400 });
  }
  // Resolve fresh signed URLs at render time rather than trusting the
  // legacy permanent Asset.url column — the render worker downloads each of
  // these once, well within a presigned URL's expiry.
  const assetUrls: Record<string, string> = {};
  await Promise.all(assets.map(async (a) => { assetUrls[a.id] = await getAssetReadUrl(a.s3Key); }));

  // Runtime capability gate — BEFORE any credit is spent (P0-2).
  //
  // During the P0-2 outage every export was charged a credit and enqueued
  // into a render that could not possibly succeed, because the deployed
  // ffmpeg lacked `drawtext`. Refunds fired afterwards, but the service was
  // knowingly selling a guaranteed failure. If the runtime cannot satisfy the
  // render contract, refuse here instead: no charge, no queue entry.
  const runtime = await getRenderRuntimeHealth(ffmpegBin);
  if (!runtime.ok) {
    logger.error("editor-render", `${RENDER_RUNTIME_UNHEALTHY} — refusing export`, {
      code: RENDER_RUNTIME_UNHEALTHY,
      binaryPath: runtime.binaryPath,
      version: runtime.version,
      spawnError: runtime.spawnError,
      missingFilters: runtime.missingFilters,
      missingEncoders: runtime.missingEncoders,
      projectId,
    });
    return NextResponse.json(
      { error: RENDER_RUNTIME_UNHEALTHY, message: RENDER_RUNTIME_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  // Fast-path credit check via Redis cache.
  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < EDITOR_RENDER_CREDIT_COST) {
    return NextResponse.json(
      { error: "insufficient_credits", required: EDITOR_RENDER_CREDIT_COST, balance: cached },
      { status: 402 },
    );
  }

  // Atomic claim BEFORE charging: of two simultaneous Export clicks exactly one
  // flips the status and goes on to pay; the other gets count 0 and a 409.
  // (Previously both passed the status read above and both were charged.)
  const claimed = await prisma.project.updateMany({
    where: { id: projectId, userId: auth.userId, status: { not: "rendering" } },
    data: { status: "rendering", progress: 0, videoUrl: null, failureReason: null },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Project is already rendering" }, { status: 409 });
  }
  const releaseClaim = () =>
    prisma.project
      .update({ where: { id: projectId }, data: { status: project.status, progress: project.progress } })
      .catch((e) => logger.error("editor-render", `could not release render claim for ${projectId}`, e));

  // Bucket-aware atomic spend; refId ties the ledger rows to this render so
  // the worker's failure refund restores exactly the buckets drained here.
  const refId = `editor-render:${projectId}`;
  const spend = await spendCredits({
    userId: auth.userId,
    amount: EDITOR_RENDER_CREDIT_COST,
    reason: "spend:editor-render",
    refId,
  });
  if (!spend.ok) {
    await releaseClaim();
    return NextResponse.json(
      { error: "insufficient_credits", required: EDITOR_RENDER_CREDIT_COST, balance: spend.balances.total },
      { status: 402 },
    );
  }

  // A fresh job id per export. BullMQ silently ignores an add whose id it
  // still retains (completed/failed jobs are kept), so reusing the project id
  // meant a project's second export was charged and never ran.
  const jobId = `${projectId}-${Date.now().toString(36)}`;
  try {
    await renderQueue.enqueue(jobId, { projectId, assetUrls }, {
      priority: tierPriority(await getUserTier(auth.userId)),
      rejectOnFailure: true,
    });
  } catch (err) {
    logger.error("editor-render", `enqueue failed for ${projectId}`, err);
    await restoreSpend({ userId: auth.userId, refId, amount: EDITOR_RENDER_CREDIT_COST, reason: "refund:editor-render-enqueue-failed" })
      .catch((e) => logger.error("editor-render", `refund after failed enqueue failed for ${projectId}`, e));
    await releaseClaim();
    return NextResponse.json({ error: "Couldn't start the export. You weren't charged — please try again." }, { status: 503 });
  }

  return NextResponse.json({ status: "rendering", creditsRemaining: spend.balances.total });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "editor:render" });
