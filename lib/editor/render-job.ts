// Server-only editor render job: download assets → probe audio streams →
// build filtergraph → run ffmpeg with progress → upload → update Project.
// Enqueued by app/api/editor/render/route.ts via createRenderQueue.

import os from "os";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { setRenderProgress } from "@/lib/render-queue";
import { runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { downloadFile } from "@/utils/download";
import { logger } from "@/lib/logger";
import type { TimelineDoc } from "./types";
import { normalizeDoc } from "./types";
import { buildFilterGraph, maybeUseFilterScript, writeTextFiles, type ClipInput } from "./filtergraph";
import { generateCaptionASS } from "./caption-ass";

export const EDITOR_RENDER_CREDIT_COST = 1;

export interface EditorRenderPayload {
  projectId: string;
  /** assetId → public/presigned URL resolved server-side at enqueue time */
  assetUrls: Record<string, string>;
}

// Probe whether a media file has an audio stream by parsing ffmpeg -i stderr.
function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Reuse the same binary resolution as ffmpeg-render by spawning through PATH
    // fallback: utils/ffmpeg-render resolves the binary internally for its own
    // helpers; here a plain probe with ffmpeg-static's path keeps it simple.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegPath: string = require("ffmpeg-static") ?? "ffmpeg";
    const proc = spawn(ffmpegPath, ["-i", filePath], { windowsHide: true });
    let stderr = "";
    let settled = false;
    // A probe should be near-instant; if it hangs, kill it rather than let it
    // block the render queue behind it (see utils/ffmpeg-render.ts).
    const timer = setTimeout(() => { proc.kill("SIGKILL"); }, 30_000);
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", () => finish(/Stream #\d+:\d+.*Audio/.test(stderr)));
    proc.on("error", () => finish(false));
  });
}

async function refundCredit(projectId: string) {
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    await prisma.user.update({
      where: { id: proj.userId },
      data: { credits: { increment: EDITOR_RENDER_CREDIT_COST } },
    });
    const cached = await redis.get(`credits:${proj.userId}`);
    if (cached !== null) {
      await redis.set(
        `credits:${proj.userId}`,
        String(parseInt(cached, 10) + EDITOR_RENDER_CREDIT_COST),
        "EX",
        3600,
      );
    }
  } catch (e) {
    logger.error("editor-render", `refund failed for ${projectId}`, e);
  }
}

export async function editorRenderJob(payload: EditorRenderPayload): Promise<void> {
  const { projectId, assetUrls } = payload;
  const tmp = os.tmpdir();
  const tempFiles: string[] = [];
  const outPath = path.join(tmp, `editor-${projectId}-out.mp4`);
  tempFiles.push(outPath);

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project?.editorDoc) throw new Error("Project has no editor document");
    // Backfills any track arrays missing from an older saved doc (e.g. one
    // predating the caption track) — this re-fetches editorDoc independently
    // of whatever validation already ran when the render was enqueued, so it
    // must normalize defensively rather than assume an upstream caller did.
    const doc = normalizeDoc(project.editorDoc as unknown as TimelineDoc);

    // ── Download unique assets ──
    await setRenderProgress(projectId, "downloading", 5);
    await prisma.project.update({ where: { id: projectId }, data: { progress: 5 } });

    const imageAssetIds = new Set(doc.tracks.image.map((c) => c.assetId));

    const assets = new Map<string, ClipInput>();
    const entries = Object.entries(assetUrls);
    for (let i = 0; i < entries.length; i++) {
      const [assetId, url] = entries[i];
      const ext = path.extname(new URL(url).pathname) || ".mp4";
      const localPath = path.join(tmp, `editor-${projectId}-${assetId}${ext}`);
      await downloadFile(url, localPath);
      tempFiles.push(localPath);
      const isImage = imageAssetIds.has(assetId);
      const hasAudio = isImage ? false : await hasAudioStream(localPath);
      assets.set(assetId, { filePath: localPath, hasAudio, isImage });
      const pct = 5 + Math.round(((i + 1) / entries.length) * 15);
      await setRenderProgress(projectId, "downloading", pct);
      await prisma.project.update({ where: { id: projectId }, data: { progress: pct } });
    }

    // ── Build + run ffmpeg ──
    const textFiles = writeTextFiles(doc, tmp, `editor-${projectId}`);
    for (const p of textFiles.values()) tempFiles.push(p);

    let captionAssPath: string | undefined;
    if (doc.tracks.caption.length > 0) {
      captionAssPath = path.join(tmp, `editor-${projectId}-captions.ass`);
      generateCaptionASS(doc.tracks.caption, doc.aspect, captionAssPath);
      tempFiles.push(captionAssPath);
    }

    const result = buildFilterGraph({ doc, assets, textFiles, captionAssPath, outputPath: outPath });
    const scriptPath = path.join(tmp, `editor-${projectId}-graph.txt`);
    const args = maybeUseFilterScript(result, scriptPath);
    if (args !== result.args) tempFiles.push(scriptPath);

    await setRenderProgress(projectId, "rendering", 20);
    await runFFmpegWithProgress(args, async (pct) => {
      const overall = 20 + Math.round((pct / 100) * 65);
      await setRenderProgress(projectId, "rendering", overall);
      prisma.project.update({ where: { id: projectId }, data: { progress: overall } }).catch(() => {});
    });

    // ── Upload ──
    await setRenderProgress(projectId, "uploading", 90);
    await prisma.project.update({ where: { id: projectId }, data: { progress: 90 } });
    const videoUrl = await uploadFileToS3(outPath, `renders/${projectId}.mp4`, "video/mp4");

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", progress: 100, videoUrl },
    });
    await setRenderProgress(projectId, "completed", 100);
  } catch (err) {
    logger.error("editor-render", `failed for ${projectId}`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } }).catch(() => {});
    await setRenderProgress(projectId, "failed");
    await refundCredit(projectId);
  } finally {
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}
