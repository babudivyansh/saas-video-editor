import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/lib/api-handler";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getUserTier, type TokenPayload } from "@/lib/auth";
import { tierPriority } from "@/lib/plans/tiers";
import { prisma } from "@/lib/prisma";
import { createRenderQueue } from "@/lib/render-queue";
import { normalizeDoc, originalFrame, validateDoc, type TimelineDoc } from "@/lib/editor/types";
import { checkTemplateChoice } from "@/lib/captions/gate";
import {
  CAPTION_EXPORT_ASPECTS,
  CAPTION_EXPORT_CREDIT_COST,
  captionExportJob,
  captionExportRefId,
  docForAspect,
  settleBatchIfDone,
  type CaptionExportPayload,
} from "@/lib/editor/caption-export";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { spendCredits } from "@/lib/credits";
import { ffmpegBin } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";
import { getRenderRuntimeHealth, RENDER_RUNTIME_UNHEALTHY, RENDER_RUNTIME_UNAVAILABLE_MESSAGE } from "@/lib/render-runtime";

const exportQueue = createRenderQueue<CaptionExportPayload>("caption-export", captionExportJob);

// Projects whose doc can be exported in several shapes at once.
const EXPORTABLE = ["captions", "editor"];

const postSchema = z.object({
  projectId: z.string().min(1),
  aspects: z.array(z.enum(CAPTION_EXPORT_ASPECTS)).min(1).max(CAPTION_EXPORT_ASPECTS.length)
    .refine((a) => new Set(a).size === a.length, "Each shape once"),
});

// POST /api/captions/export { projectId, aspects }
// Renders the saved doc once per requested shape. Charged once for the whole
// batch; lib/editor/caption-export.ts settles it when the last render ends.
async function handlePOST(req: NextRequest, { auth }: { auth: TokenPayload }) {
  const { projectId, aspects } = await parseBody(req, postSchema);

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId, productType: { in: EXPORTABLE } } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const raw = project.editorDoc as unknown as TimelineDoc | null;
  if (!raw) return NextResponse.json({ error: "Nothing to export yet" }, { status: 400 });
  const doc = normalizeDoc(raw);
  if (doc.tracks.video.length === 0) return NextResponse.json({ error: "Add a video before exporting" }, { status: 400 });

  for (const templateId of new Set(doc.tracks.caption.flatMap((c) => (c.templateId ? [c.templateId] : [])))) {
    const locked = await checkTemplateChoice(auth.userId, templateId);
    if (locked) return NextResponse.json(locked.body, { status: locked.status });
  }

  const assetIds = [...new Set([...doc.tracks.video, ...doc.tracks.audio, ...doc.tracks.image].map((c) => c.assetId))];
  const assets = await prisma.asset.findMany({ where: { id: { in: assetIds }, userId: auth.userId } });
  if (assets.length !== assetIds.length) {
    return NextResponse.json({ error: "One or more media files are missing from your library" }, { status: 400 });
  }

  // "Original" is the first video's own shape: the doc's size when the
  // project is already original, else the stored size of that video.
  let originalSize: { w: number; h: number } | undefined;
  if (aspects.includes("original")) {
    if (doc.aspect === "original" && doc.size) originalSize = doc.size;
    else {
      const first = assets.find((a) => a.id === doc.tracks.video[0]!.assetId);
      if (first?.width && first?.height) originalSize = originalFrame(first.width, first.height);
    }
    if (!originalSize) {
      return NextResponse.json({ error: "We don't know this video's original size. Pick another shape." }, { status: 400 });
    }
  }
  for (const aspect of aspects) {
    const err = validateDoc(docForAspect(doc, aspect, originalSize));
    if (err) return NextResponse.json({ error: `Invalid timeline: ${err}` }, { status: 400 });
  }

  const runtime = await getRenderRuntimeHealth(ffmpegBin);
  if (!runtime.ok) {
    logger.error("caption-export", `${RENDER_RUNTIME_UNHEALTHY} — refusing export`, { projectId, missingFilters: runtime.missingFilters });
    return NextResponse.json({ error: RENDER_RUNTIME_UNHEALTHY, message: RENDER_RUNTIME_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  // Claim: the batch's rows exist only if no other batch is still running.
  // The advisory lock serialises two simultaneous clicks on one project.
  const batchId = randomUUID();
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`caption-export:${projectId}`}))`;
    const active = await tx.projectRender.count({ where: { projectId, status: { in: ["queued", "rendering"] } } });
    if (active > 0) return null;
    return Promise.all(
      aspects.map((aspect) => tx.projectRender.create({ data: { projectId, userId: auth.userId, batchId, aspect } })),
    );
  });
  if (!rows) return NextResponse.json({ error: "This project is already exporting" }, { status: 409 });

  const spend = await spendCredits({
    userId: auth.userId,
    amount: CAPTION_EXPORT_CREDIT_COST,
    reason: "spend:caption-export",
    refId: captionExportRefId(batchId),
  });
  if (!spend.ok) {
    await prisma.projectRender.deleteMany({ where: { batchId } });
    return NextResponse.json(
      { error: "insufficient_credits", required: CAPTION_EXPORT_CREDIT_COST, balance: spend.balances.total },
      { status: 402 },
    );
  }

  const assetUrls: Record<string, string> = {};
  await Promise.all(assets.map(async (a) => { assetUrls[a.id] = await getAssetReadUrl(a.s3Key); }));
  const priority = tierPriority(await getUserTier(auth.userId));
  for (const row of rows) {
    try {
      await exportQueue.enqueue(row.id, { projectId, renderId: row.id, assetUrls, ...(row.aspect === "original" ? { size: originalSize } : {}) }, {
        priority,
        rejectOnFailure: true,
      });
    } catch (err) {
      logger.error("caption-export", `enqueue failed for render ${row.id}`, err);
      await prisma.projectRender.update({
        where: { id: row.id },
        data: { status: "failed", failureReason: "Couldn't start this render. Please try again." },
      });
    }
  }
  // If nothing could be queued the batch is already over: refund now.
  await settleBatchIfDone(batchId);

  return NextResponse.json({ batchId, renders: rows.map((r) => ({ id: r.id, aspect: r.aspect })), creditsRemaining: spend.balances.total }, { status: 202 });
}

export const POST = withRateLimit(withApi(handlePOST), { limit: 10, windowSec: 60, keyBy: "user", name: "captions:export" });

const getSchema = z.object({ projectId: z.string().min(1) });

// GET /api/captions/export?projectId= — the latest batch, for polling and downloads.
export const GET = withApi(async (req, { auth }) => {
  const { projectId } = parseQuery(req, getSchema);
  const latest = await prisma.projectRender.findFirst({
    where: { projectId, userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: { batchId: true },
  });
  if (!latest) return NextResponse.json({ batchId: null, renders: [] });
  const rows = await prisma.projectRender.findMany({ where: { batchId: latest.batchId }, orderBy: { createdAt: "asc" } });
  const order = (a: string) => CAPTION_EXPORT_ASPECTS.indexOf(a as (typeof CAPTION_EXPORT_ASPECTS)[number]);
  rows.sort((a, b) => order(a.aspect) - order(b.aspect));
  return NextResponse.json({
    batchId: latest.batchId,
    renders: await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        aspect: r.aspect,
        status: r.status,
        progress: r.progress,
        failureReason: r.failureReason,
        url: r.status === "completed" && r.s3Key ? await getAssetReadUrl(r.s3Key) : null,
      })),
    ),
  });
});
