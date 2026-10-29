// Caption Studio's multi-ratio export: one click renders the same project in
// several frame shapes. Each ratio is a ProjectRender row and its own queue
// job; the whole batch is charged once (app/api/captions/export) and settled
// once, by whichever render finishes last: refunded if nothing rendered,
// owner notified either way.

import os from "os";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { restoreSpend } from "@/lib/credits";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify";
import { markQuestComplete } from "@/lib/quests";
import { normalizeDoc, validateDoc, type Aspect, type TimelineDoc } from "./types";
import { renderTimeline, EDITOR_RENDER_CREDIT_COST } from "./render-job";
import { classifyRenderFailure } from "./render-failure";

export { CAPTION_EXPORT_ASPECTS, type CaptionExportAspect } from "./caption-export-shapes";

/** One batch is charged this many AI credits, however many ratios it has. */
export const CAPTION_EXPORT_CREDIT_COST = EDITOR_RENDER_CREDIT_COST;

export const captionExportRefId = (batchId: string) => `caption-export:${batchId}`;

const ACTIVE = ["queued", "rendering"];

export interface CaptionExportPayload {
  /** The queue keys progress by projectId; the row to render is renderId. */
  projectId: string;
  renderId: string;
  assetUrls: Record<string, string>;
  /** The frame for an "original" render, fixed when the batch was created. */
  size?: { w: number; h: number };
}

/** The project's doc in another frame shape. Everything else is untouched. */
export function docForAspect(doc: TimelineDoc, aspect: Aspect, size?: { w: number; h: number }): TimelineDoc {
  if (aspect === "original") return { ...doc, aspect, size: size ?? doc.size };
  return { ...doc, aspect };
}

export function renderS3Key(projectId: string, renderId: string): string {
  return `renders/${projectId}/${renderId}.mp4`;
}

/** True while any ratio of any batch is still queued or rendering. */
export async function hasActiveRender(projectId: string): Promise<boolean> {
  return (await prisma.projectRender.count({ where: { projectId, status: { in: ACTIVE } } })) > 0;
}

/**
 * Settles a batch once every ratio is done: refund if none rendered, notify.
 * Safe to call from every finishing render (and the stale sweep): claiming
 * settledAt with a conditional update lets exactly one caller through.
 */
export async function settleBatchIfDone(batchId: string): Promise<"settled" | "pending" | "already"> {
  const rows = await prisma.projectRender.findMany({
    where: { batchId },
    select: { status: true, projectId: true, userId: true },
  });
  if (!rows.length || rows.some((r) => ACTIVE.includes(r.status))) return "pending";
  const claim = await prisma.projectRender.updateMany({ where: { batchId, settledAt: null }, data: { settledAt: new Date() } });
  if (claim.count === 0) return "already";

  const { projectId, userId } = rows[0];
  const done = rows.filter((r) => r.status === "completed").length;
  if (done === 0) {
    await restoreSpend({
      userId,
      refId: captionExportRefId(batchId),
      amount: CAPTION_EXPORT_CREDIT_COST,
      reason: "refund:caption-export-failed",
    }).catch((e) => logger.error("caption-export", `refund failed for batch ${batchId}`, e));
  } else {
    void markQuestComplete(userId, "first-export");
  }

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { title: true } });
    const href = `/dashboard/captions/${projectId}?step=export`;
    const title = project?.title ?? "Your video";
    await notify(
      done === rows.length
        ? { userId, type: "editor_export_complete", title: "Your captioned videos are ready 🎬", body: `“${title}” — ${done} ${done === 1 ? "video" : "videos"} exported.`, href }
        : done > 0
          ? { userId, type: "editor_export_complete", title: "Some of your videos are ready", body: `“${title}” — ${done} of ${rows.length} exported. Try the others again.`, href }
          : { userId, type: "editor_export_failed", title: "Your export didn’t finish", body: "Nothing could be rendered. Your credit was refunded.", href },
    );
  } catch (e) {
    logger.error("caption-export", `notify failed for batch ${batchId}`, e);
  }
  return "settled";
}

export async function captionExportJob(payload: CaptionExportPayload): Promise<void> {
  const { renderId, assetUrls, size } = payload;
  const tmp = os.tmpdir();
  const tempFiles: string[] = [];
  const outPath = path.join(tmp, `caption-${renderId}-out.mp4`);
  tempFiles.push(outPath);

  const render = await prisma.projectRender.findUnique({ where: { id: renderId } });
  if (!render || render.status !== "queued") return; // swept or already handled
  const { projectId, batchId } = render;

  try {
    await prisma.projectRender.update({ where: { id: renderId }, data: { status: "rendering", progress: 1 } });
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { editorDoc: true, userId: true } });
    if (!project?.editorDoc) throw new Error("Project has no editor document");
    // A fresh read, as in editorRenderJob: the doc may have been saved since
    // the route checked it.
    const doc = docForAspect(normalizeDoc(project.editorDoc as unknown as TimelineDoc), render.aspect as Aspect, size);
    const docError = validateDoc(doc);
    if (docError) throw new Error(`Editor document failed validation: ${docError}`);

    let lastSaved = 0;
    await renderTimeline({
      doc,
      userId: project.userId,
      assetUrls,
      tag: `caption-${renderId}`,
      outPath,
      tempFiles,
      onProgress: async (_stage, pct) => {
        // Studio polls these rows; a write per percent point is plenty.
        if (pct === lastSaved) return;
        lastSaved = pct;
        await prisma.projectRender.update({ where: { id: renderId }, data: { progress: pct } }).catch(() => {});
      },
    });

    await prisma.projectRender.update({ where: { id: renderId }, data: { progress: 90 } });
    const key = renderS3Key(projectId, renderId);
    await uploadFileToS3(outPath, key, "video/mp4");
    await prisma.projectRender.update({ where: { id: renderId }, data: { status: "completed", progress: 100, s3Key: key } });
  } catch (err) {
    const { category, userMessage } = classifyRenderFailure(err);
    logger.error("caption-export", `render ${renderId} (${render.aspect}) failed [${category}]`, err);
    await prisma.projectRender
      .update({ where: { id: renderId }, data: { status: "failed", failureReason: userMessage } })
      .catch(() => {});
  } finally {
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
  await settleBatchIfDone(batchId);
}
