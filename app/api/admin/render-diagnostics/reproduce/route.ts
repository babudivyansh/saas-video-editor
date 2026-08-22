// SEV-1 P0-2 follow-up: the synthetic smoke test in ../route.ts only
// exercises a bare testsrc -> libx264 encode and proved the AVX-512
// encoder-thread bug there. Fixing that (utils/ffmpeg-render.ts +
// lib/editor/filtergraph.ts, both now -threads 1) did NOT fix a real export
// attempt on the actual production project — it still failed identically,
// meaning the real filter_complex pipeline (scale/crop/concat/drawtext/ASS
// captions) hits a *different* failure than the synthetic test does, and
// guessing further without evidence would violate this incident's explicit
// "do not guess, collect evidence" rule.
//
// This route reproduces one specific real project's actual render exactly
// as lib/editor/render-job.ts does — real asset download, real
// buildFilterGraph() (including watermark/caption paths), real ffmpeg
// invocation with the real generated args — but read-only: it never writes
// to the Project row, never charges/refunds credits, never enqueues
// anything, and always cleans up its temp files. It exists purely to get
// the real stderr for the real failure instead of speculating about it.
//
// Admin-gated (withAdmin: role + recent OTP step-up) since this touches a
// specific user's real project and asset URLs, even though those URLs/paths
// are never included in the response (see redaction below).

import os from "os";
import path from "path";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { prisma } from "@/lib/prisma";
import { normalizeDoc, type TimelineDoc } from "@/lib/editor/types";
import { buildFilterGraph, maybeUseFilterScript, writeTextFiles, type ClipInput } from "@/lib/editor/filtergraph";
import { generateCaptionASS } from "@/lib/editor/caption-ass";
import { hasAudioStream } from "@/lib/editor/render-job";
import { getUserTier } from "@/lib/auth";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { downloadFile } from "@/utils/download";
import { runFFmpegWithProgress, ffmpegBin } from "@/utils/ffmpeg-render";

export const GET = withAdmin(async (req: NextRequest) => {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param required" }, { status: 400 });
  }

  const tmp = os.tmpdir();
  const tempFiles: string[] = [];
  const outPath = path.join(tmp, `render-diagnostics-reproduce-${projectId}-${Date.now()}.mp4`);
  tempFiles.push(outPath);

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project?.editorDoc) {
      return NextResponse.json({ error: "Project not found or has no editor document" }, { status: 404 });
    }
    const doc = normalizeDoc(project.editorDoc as unknown as TimelineDoc);

    const assetIds = [
      ...new Set([
        ...doc.tracks.video.map((c) => c.assetId),
        ...doc.tracks.audio.map((c) => c.assetId),
        ...doc.tracks.image.map((c) => c.assetId),
      ]),
    ];
    const assetRows = await prisma.asset.findMany({ where: { id: { in: assetIds } } });
    const imageAssetIds = new Set(doc.tracks.image.map((c) => c.assetId));

    const assets = new Map<string, ClipInput>();
    for (const row of assetRows) {
      const url = await getAssetReadUrl(row.s3Key);
      const ext = path.extname(new URL(url).pathname) || ".mp4";
      const localPath = path.join(tmp, `render-diagnostics-reproduce-${projectId}-${row.id}${ext}`);
      await downloadFile(url, localPath);
      tempFiles.push(localPath);
      const isImage = imageAssetIds.has(row.id);
      const hasAudio = isImage ? false : await hasAudioStream(localPath);
      assets.set(row.id, { filePath: localPath, hasAudio, isImage });
    }

    const textFiles = writeTextFiles(doc, tmp, `render-diagnostics-reproduce-${projectId}`);
    for (const p of textFiles.values()) tempFiles.push(p);

    let captionAssPath: string | undefined;
    if (doc.tracks.caption.length > 0) {
      captionAssPath = path.join(tmp, `render-diagnostics-reproduce-${projectId}-captions.ass`);
      generateCaptionASS(doc.tracks.caption, doc.aspect, captionAssPath);
      tempFiles.push(captionAssPath);
    }

    const tier = await getUserTier(project.userId);
    const result = buildFilterGraph({
      doc, assets, textFiles, captionAssPath,
      watermark: tier === "free",
      outputPath: outPath,
    });
    const scriptPath = path.join(tmp, `render-diagnostics-reproduce-${projectId}-graph.txt`);
    const args = maybeUseFilterScript(result, scriptPath);
    if (args !== result.args) tempFiles.push(scriptPath);

    let stderrTail = "";
    let succeeded = false;
    let thrown: string | null = null;
    try {
      await runFFmpegWithProgress(args, async () => {});
      succeeded = true;
    } catch (e) {
      // runFFmpegWithProgress rejects with `FFmpeg exited N:\n<stderr tail>`
      // — exactly the real error the production job itself sees and logs.
      thrown = e instanceof Error ? e.message : String(e);
      stderrTail = thrown;
    }

    let outputInfo: { exists: boolean; size: number } = { exists: false, size: 0 };
    try {
      const st = fs.statSync(outPath);
      outputInfo = { exists: true, size: st.size };
    } catch { /* stays false */ }

    // Redact anything that could be a local temp path or filename (asset
    // ids, project id) from the returned text — the ffmpeg binary path
    // itself is not a secret and is left as-is.
    const redact = (s: string) =>
      s
        .replace(new RegExp(projectId, "g"), "<projectId>")
        .replace(/[A-Za-z]:\\[^\s"']+|\/tmp\/[^\s"']+/g, "<local-path>");

    return NextResponse.json({
      projectId,
      docSummary: {
        aspect: doc.aspect,
        videoClips: doc.tracks.video.length,
        textClips: doc.tracks.text.length,
        captionClips: doc.tracks.caption.length,
        hasWatermark: tier === "free",
      },
      ffmpegBinary: ffmpegBin,
      result: succeeded
        ? "SUCCESS — real project's real filtergraph rendered successfully"
        : "FAILED — this is the real production error for this real project",
      outputProduced: outputInfo,
      argsUsed: redact(JSON.stringify(args)),
      filterComplexLength: result.filterComplex.length,
      error: thrown ? redact(thrown) : null,
      stderrTail: redact(stderrTail).slice(-3000),
    });
  } finally {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch { /* best effort cleanup */ }
    }
  }
});
