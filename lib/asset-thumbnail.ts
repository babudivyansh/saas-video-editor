// Extracts a small preview frame for a video Asset so the library grid never
// has to stream the full source file just to render a card thumbnail (audit
// finding: AssetCard used a muted <video> pointed at the full asset URL).
// Best-effort by design, same convention as lib/reframe.ts's face detection —
// a failure here must never block the upload it was triggered by.

import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { downloadS3ObjectToFile, uploadFileToS3 } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

const THUMB_TIMEOUT_MS = 30_000;
/** Longest edge of a generated image thumbnail, matching the video path's 480. */
const IMAGE_THUMB_PX = 480;

/**
 * Thumbnail + real pixel dimensions for an image Asset.
 *
 * Images previously got neither. `generateVideoThumbnail` is video-only, so
 * every image row had thumbnailS3Key = null and the grid rendered the full
 * original just to draw a card — a 40MB PNG downloaded to fill a 200px tile.
 * Width and height were client-probed only, so an image uploaded by anything
 * that didn't volunteer them (the picker, the API, an older client) had null
 * dimensions forever.
 *
 * Best-effort, like the video path: a failure here must never block the upload
 * that triggered it.
 */
export async function generateImageThumbnail(
  userId: string,
  assetId: string,
  sourceKey: string,
): Promise<{ thumbnailS3Key: string | null; width: number | null; height: number | null }> {
  const runId = randomUUID();
  const srcPath = path.join(os.tmpdir(), `thumb-src-${runId}`);
  const outPath = path.join(os.tmpdir(), `thumb-out-${runId}.jpg`);
  try {
    await downloadS3ObjectToFile(sourceKey, srcPath);
    const image = sharp(srcPath, { failOn: "none" });
    const meta = await image.metadata();

    await image
      .rotate() // honour EXIF orientation, or portrait photos come out sideways
      .resize(IMAGE_THUMB_PX, IMAGE_THUMB_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outPath);

    if (!fs.existsSync(outPath)) {
      return { thumbnailS3Key: null, width: meta.width ?? null, height: meta.height ?? null };
    }

    const key = `thumbnails/${userId}/${assetId}.jpg`;
    await uploadFileToS3(outPath, key, "image/jpeg");
    // A rotated image reports pre-rotation dimensions in metadata, so swap
    // when EXIF says the display orientation is transposed.
    const swap = typeof meta.orientation === "number" && meta.orientation >= 5;
    return {
      thumbnailS3Key: key,
      width: (swap ? meta.height : meta.width) ?? null,
      height: (swap ? meta.width : meta.height) ?? null,
    };
  } catch (e) {
    logger.warn("asset-thumbnail", `image thumbnail failed for asset ${assetId}`, { reason: (e as Error).message });
    return { thumbnailS3Key: null, width: null, height: null };
  } finally {
    for (const p of [srcPath, outPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* best-effort cleanup */ }
    }
  }
}

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
