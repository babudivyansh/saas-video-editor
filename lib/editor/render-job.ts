// Server-only editor render job: download assets → probe audio streams →
// build filtergraph → run ffmpeg with progress → upload → update Project.
// Enqueued by app/api/editor/render/route.ts via createRenderQueue.

import os from "os";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { prisma } from "@/lib/prisma";
import { setRenderProgress } from "@/lib/render-queue";
import { restoreSpend } from "@/lib/credits";
import { runFFmpegWithProgress, ffmpegBin } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { downloadFile } from "@/utils/download";
import { logger } from "@/lib/logger";
import { markQuestComplete } from "@/lib/quests";
import { notify } from "@/lib/notify";
import type { TimelineDoc } from "./types";
import { normalizeDoc, validateDoc } from "./types";
import { buildFilterGraph, maybeUseFilterScript, writeTextFiles, type ClipInput } from "./filtergraph";
import { generateCaptionASS } from "./caption-ass";
import { docDimensions } from "./types";
import { templateCaptionGroups } from "@clipiro/shared/captions";
import { planEmoji } from "@clipiro/shared/caption-emoji";
import { effectiveCaptionTemplate } from "@clipiro/shared/caption-style";
import { buildCaptionTrack, type CaptionTrack } from "@/lib/captions/engine";
import { sanitizeCaptionWord } from "@/lib/caption-sanitize";
import { classifyRenderFailure } from "./render-failure";

export const EDITOR_RENDER_CREDIT_COST = 1;

export interface EditorRenderPayload {
  projectId: string;
  /** assetId → public/presigned URL resolved server-side at enqueue time */
  assetUrls: Record<string, string>;
}

// Probe whether a media file has an audio stream by parsing ffmpeg -i stderr.
export function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Use the one resolved, exec-bit-restored binary from ffmpeg-render. The
    // previous `require("ffmpeg-static")` returned Next's rewritten "\ROOT\…"
    // path on the standalone build and skipped the chmod that keeps a deploy
    // from failing every spawn with EACCES.
    const proc = spawn(ffmpegBin, ["-i", filePath], { windowsHide: true });
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

/**
 * Tells the owner how the export went (bell + phone push). The phone leaves
 * the Export screen while the server renders, so the result must find them.
 */
async function notifyExport(projectId: string, outcome: "completed" | "failed", reason?: string) {
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true, title: true } });
    if (!proj) return;
    const href = `/dashboard/editor?projectId=${projectId}`;
    await notify(
      outcome === "completed"
        ? { userId: proj.userId, type: "editor_export_complete", title: "Your video is ready 🎬", body: `“${proj.title}” finished exporting.`, href }
        : { userId: proj.userId, type: "editor_export_failed", title: "Your export didn’t finish", body: reason ?? "Your credit was refunded.", href },
    );
  } catch (e) {
    logger.error("editor-render", `notify failed for ${projectId}`, e);
  }
}

async function refundCredit(projectId: string) {
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    // Restores exactly the buckets the route's spend drained (ledger refId).
    await restoreSpend({
      userId: proj.userId,
      refId: `editor-render:${projectId}`,
      amount: EDITOR_RENDER_CREDIT_COST,
      reason: "refund:editor-render-failed",
    });
  } catch (e) {
    logger.error("editor-render", `refund failed for ${projectId}`, e);
  }
}

export interface RenderTimelineInput {
  doc: TimelineDoc;
  /** The owner: decides the free-tier watermark and 720p cap. */
  userId: string;
  /** assetId → presigned URL, resolved at enqueue time. */
  assetUrls: Record<string, string>;
  /** Prefix for this render's temp files; unique per render. */
  tag: string;
  outPath: string;
  /** Every temp file made is pushed here for the caller to delete. */
  tempFiles: string[];
  /** 5-20 while downloading, 20-85 while ffmpeg runs. */
  onProgress: (stage: "downloading" | "rendering", percent: number) => Promise<void>;
}

/**
 * The render itself, shared by the editor export (one file per project) and
 * Caption Studio's multi-ratio export (lib/editor/caption-export.ts): download
 * the doc's media, build the caption tracks and filtergraph for the doc's own
 * frame, and run ffmpeg into outPath. Status, upload and refunds stay with the
 * caller.
 */
export async function renderTimeline({ doc, userId, assetUrls, tag, outPath, tempFiles, onProgress }: RenderTimelineInput): Promise<void> {
  const tmp = os.tmpdir();
  // ── Download unique assets ──
  await onProgress("downloading", 5);

  const imageAssetIds = new Set(doc.tracks.image.map((c) => c.assetId));

  const assets = new Map<string, ClipInput>();
  const entries = Object.entries(assetUrls);
  for (let i = 0; i < entries.length; i++) {
    const [assetId, url] = entries[i];
    const ext = path.extname(new URL(url).pathname) || ".mp4";
    const localPath = path.join(tmp, `${tag}-${assetId}${ext}`);
    await downloadFile(url, localPath);
    tempFiles.push(localPath);
    const isImage = imageAssetIds.has(assetId);
    const hasAudio = isImage ? false : await hasAudioStream(localPath);
    assets.set(assetId, { filePath: localPath, hasAudio, isImage });
    const pct = 5 + Math.round(((i + 1) / entries.length) * 15);
    await onProgress("downloading", pct);
  }

  // ── Build + run ffmpeg ──
  const textFiles = writeTextFiles(doc, tmp, tag);
  for (const p of textFiles.values()) tempFiles.push(p);

  // Plain cues keep the editor's own per-cue styling; cues carrying a
  // caption template are burned by the template engine instead.
  let captionAssPath: string | undefined;
  const plainCues = doc.tracks.caption.filter((c) => !c.templateId);
  if (plainCues.length > 0) {
    captionAssPath = path.join(tmp, `${tag}-captions.ass`);
    generateCaptionASS(plainCues, docDimensions(doc), captionAssPath);
    tempFiles.push(captionAssPath);
  }
  const { w: capW, h: capH } = docDimensions(doc);
  const captionTemplateTracks: { track: CaptionTrack; assPath: string }[] = [];
  templateCaptionGroups(doc.tracks.caption).forEach((group, i) => {
    const { template, positionY } = effectiveCaptionTemplate(group.templateId, doc.captionStyle, { w: capW, h: capH });
    const words = group.words
      .map((w) => ({ ...w, word: sanitizeCaptionWord(w.word).trim() }))
      .filter((w) => w.word);
    if (!words.length) return;
    const track = buildCaptionTrack({
      words,
      template,
      W: capW,
      H: capH,
      accent: group.accent,
      positionY,
      emoji: planEmoji(words, template.emoji !== "none"),
    });
    const assPath = path.join(tmp, `${tag}-template-${i}.ass`);
    fs.writeFileSync(assPath, track.ass);
    tempFiles.push(assPath);
    captionTemplateTracks.push({ track, assPath });
  });

  // Free-tier renders are watermarked + 720p-capped. Tier is re-derived
  // here (not passed in the payload) so it's decided in one place and is
  // correct even for jobs that sat in the queue across an upgrade.
  const { getUserTier } = await import("@/lib/auth");
  const tier = await getUserTier(userId);
  const result = buildFilterGraph({
    doc, assets, textFiles, captionAssPath, captionTemplateTracks,
    watermark: tier === "free",
    outputPath: outPath,
  });
  const scriptPath = path.join(tmp, `${tag}-graph.txt`);
  const args = maybeUseFilterScript(result, scriptPath);
  if (args !== result.args) tempFiles.push(scriptPath);

  await onProgress("rendering", 20);
  await runFFmpegWithProgress(args, async (pct) => {
    await onProgress("rendering", 20 + Math.round((pct / 100) * 65));
  });
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
    // The render route validated the doc it was handed, but this is a fresh
    // read: a save after that check (or before a retry) would otherwise reach
    // ffmpeg unchecked. Fails into the catch below: marked failed, refunded.
    const docError = validateDoc(doc);
    if (docError) throw new Error(`Editor document failed validation: ${docError}`);

    await renderTimeline({
      doc,
      userId: project.userId,
      assetUrls,
      tag: `editor-${projectId}`,
      outPath,
      tempFiles,
      onProgress: async (stage, pct) => {
        await setRenderProgress(projectId, stage, pct);
        // Downloads are few and slow, so each step is saved; ffmpeg reports
        // many times a second, so those writes don't hold the render up.
        if (stage === "downloading") await prisma.project.update({ where: { id: projectId }, data: { progress: pct } });
        else prisma.project.update({ where: { id: projectId }, data: { progress: pct } }).catch(() => {});
      },
    });

    // ── Upload ──
    await setRenderProgress(projectId, "uploading", 90);
    await prisma.project.update({ where: { id: projectId }, data: { progress: 90 } });
    const videoUrl = await uploadFileToS3(outPath, `renders/${projectId}.mp4`, "video/mp4");

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", progress: 100, videoUrl },
    });
    void markQuestComplete(project.userId, "first-export");
    await setRenderProgress(projectId, "completed", 100);
    await notifyExport(projectId, "completed");
  } catch (err) {
    // classification never throws and never echoes the raw error text back to
    // the project owner — the full message/stack (which can include ffmpeg
    // stderr, S3 keys, local paths) still reaches engineering via logger.error
    // -> Sentry, tagged with the category for easy triage.
    const { category, userMessage } = classifyRenderFailure(err);
    logger.error("editor-render", `failed for ${projectId} [${category}]`, err);
    await prisma.project
      .update({ where: { id: projectId }, data: { status: "failed", failureReason: userMessage } })
      .catch(() => {});
    await setRenderProgress(projectId, "failed");
    await refundCredit(projectId);
    await notifyExport(projectId, "failed", `${userMessage} Your credit was refunded.`);
  } finally {
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}
