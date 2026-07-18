// Extracts a small preview frame for a video Asset so the library grid never
// has to stream the full source file just to render a card thumbnail (audit
// finding: AssetCard used a muted <video> pointed at the full asset URL).
// Best-effort by design, same convention as lib/reframe.ts's face detection —
// a failure here must never block the upload it was triggered by.

import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { downloadS3ObjectToFile, uploadFileToS3 } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

const THUMB_TIMEOUT_MS = 30_000;

export async function generateVideoThumbnail(
  userId: string,
  assetId: string,
  sourceKey: string,
  sourceExt: string,
): Promise<string | null> {
  const tmp = os.tmpdir();
  const runId = randomUUID();
  const srcPath = path.join(tmp, `thumb-src-${runId}.${sourceExt}`);
  const outPath = path.join(tmp, `thumb-out-${runId}.jpg`);

  try {
    await downloadS3ObjectToFile(sourceKey, srcPath);

    try {
      await runFFmpegArgs(["-ss", "00:00:01", "-i", srcPath, "-frames:v", "1", "-vf", "scale=480:-1", "-y", outPath], THUMB_TIMEOUT_MS);
    } catch {
      // Video shorter than 1s (or the 1s seek landed past EOF) — retry at t=0.
      await runFFmpegArgs(["-i", srcPath, "-frames:v", "1", "-vf", "scale=480:-1", "-y", outPath], THUMB_TIMEOUT_MS);
    }

    if (!fs.existsSync(outPath)) return null;

    const key = `thumbnails/${userId}/${assetId}.jpg`;
    await uploadFileToS3(outPath, key, "image/jpeg");
    return key;
  } catch (e) {
    logger.warn("asset-thumbnail", `thumbnail generation failed for asset ${assetId}`, { reason: (e as Error).message });
    return null;
  } finally {
    for (const p of [srcPath, outPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* best-effort cleanup */ }
    }
  }
}
