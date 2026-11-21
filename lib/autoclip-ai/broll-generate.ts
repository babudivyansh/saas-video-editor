// Stage 2 — B-roll that doesn't come from a stock search.
//
//   * ai_image: a fal image model draws a still for the sentence, and ffmpeg
//     turns it into a short slow-pan clip. Seconds and a fraction of a cent.
//   * ai_video: a fal video model. Slow (often minutes) and priced per clip,
//     so it is Studio-only, needs the user's own opt-in, is capped per clip,
//     and is only SUBMITTED during analysis — the render polls for it and
//     skips the window if it isn't ready, so it can never hold a run up.
//   * source cutaway: a shot from elsewhere in the same video (a screen share,
//     a product shot), cut out once and stored like any other insert.
//
// Everything produced here is uploaded under broll/{userId}/... in our own
// bucket, so the render presigns it exactly like the source video.

import fs from "fs";
import os from "os";
import path from "path";
import { falSubmit, falPollUntilDone, falCancel, extractResultUrl, type FalRequest } from "@/lib/fal";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { downloadFile } from "@/utils/download";
import { runFFmpegArgs, ffmpegInputArgs } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { isAllowedStockHost } from "@/lib/stock-hosts";
import { TARGET_RES } from "@/lib/reframe";
import type { AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import type { AiBudget } from "@/lib/autoclip-ai/budget";

type Aspect = "9:16" | "16:9" | "1:1";

export function falConfigured(): boolean {
  return Boolean(env.FAL_KEY);
}

/** A prompt for a cutaway shot. No text: rendered text in generated media is the tell-tale artifact. */
export function cutawayPrompt(queries: string[], sentence: string): string {
  const shot = queries[0] ?? sentence;
  return `${shot}. Cinematic, photorealistic, natural light, shallow depth of field, ` +
    `illustrating: "${sentence.slice(0, 200)}". No text, no captions, no logos, no watermark.`;
}

const IMAGE_SIZE: Record<Aspect, string> = { "9:16": "portrait_16_9", "16:9": "landscape_16_9", "1:1": "square_hd" };

function brollKey(userId: string, projectId: string, tag: string): string {
  // The user id as a path segment is what lets ownsKey (lib/source-url.ts)
  // prove ownership and presign it at render time.
  return `broll/${userId}/${projectId}/${tag}-${Date.now().toString(36)}.mp4`;
}

/** ffmpeg arguments for a slow push-in over a still, at the clip's output size. */
export function kenBurnsArgs(imagePath: string, outPath: string, aspect: Aspect, durationSec: number): string[] {
  const { w, h } = TARGET_RES[aspect];
  const fps = 30;
  const frames = Math.max(1, Math.round(durationSec * fps));
  // Scale up first so zoompan has pixels to zoom into without visible softening.
  const vf = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
    `zoompan=z='min(1+0.10*on/${frames},1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${fps},format=yuv420p`;
  return [
    "-y", "-loop", "1", "-i", imagePath, "-t", durationSec.toFixed(2), "-vf", vf,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart", outPath,
  ];
}

/**
 * Generate a still and turn it into a clip. Returns our S3 URL, or null (no
 * key, over budget, the model failed) — the window then has no insert.
 */
export async function generateImageBroll(args: {
  queries: string[];
  sentence: string;
  aspect: Aspect;
  durationSec: number;
  userId: string;
  projectId: string;
  clip: number;
  cfg: AutoClipAiConfig;
  budget: AiBudget;
}): Promise<string | null> {
  if (!falConfigured()) return null;
  if (!args.budget.tryReserve("broll_ai_image", args.cfg.unitCostUsd.falImage, args.clip)) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "broll-img-"));
  try {
    const req = await falSubmit(args.cfg.broll.imageModel, {
      prompt: cutawayPrompt(args.queries, args.sentence),
      image_size: IMAGE_SIZE[args.aspect],
      num_images: 1,
      enable_safety_checker: true,
    });
    const raw = await falPollUntilDone(req, { deadlineMs: 90_000, pollIntervalMs: 2000 });
    const url = extractResultUrl(raw, ["images.0.url", "image.url"]);
    const img = path.join(tmp, "still.img");
    await downloadFile(url, img, undefined, { allowHost: (h: string) => isAllowedStockHost(h, "fal") });
    const out = path.join(tmp, "broll.mp4");
    await runFFmpegArgs(kenBurnsArgs(img, out, args.aspect, Math.max(1.5, Math.min(5, args.durationSec + 0.3))), 120_000);
    return await uploadFileToS3(out, brollKey(args.userId, args.projectId, `c${args.clip}-img`), "video/mp4");
  } catch (err) {
    logger.warn("autoclip-ai", "generated image B-roll failed", err);
    return null;
  } finally {
    fs.rmSync(/*turbopackIgnore: true*/ tmp, { recursive: true, force: true });
  }
}

/** Submit a video generation; the render collects it (collectVideoBroll). */
export async function submitVideoBroll(args: {
  queries: string[];
  sentence: string;
  clip: number;
  cfg: AutoClipAiConfig;
  budget: AiBudget;
}): Promise<FalRequest | null> {
  if (!falConfigured()) return null;
  if (!args.budget.tryReserve("broll_ai_video", args.cfg.unitCostUsd.falVideo, args.clip)) return null;
  try {
    return await falSubmit(args.cfg.broll.videoModel, { prompt: cutawayPrompt(args.queries, args.sentence) });
  } catch (err) {
    logger.warn("autoclip-ai", "video B-roll submit failed", err);
    return null;
  }
}

/** How long a render waits for a pending generated video before giving up on that window. */
export const VIDEO_BROLL_WAIT_MS = 3 * 60 * 1000;

/**
 * At render time: wait (bounded) for a submitted video and download it to
 * `dest`. False when it isn't ready or failed — the window is dropped.
 */
export async function collectVideoBroll(req: FalRequest, dest: string, waitMs = VIDEO_BROLL_WAIT_MS): Promise<boolean> {
  try {
    const raw = await falPollUntilDone(req, { deadlineMs: waitMs, pollIntervalMs: 4000 });
    const url = extractResultUrl(raw, ["video.url", "videos.0.url", "output.video.url"]);
    await downloadFile(url, dest, undefined, { allowHost: (h: string) => isAllowedStockHost(h, "fal") });
    return true;
  } catch (err) {
    logger.warn("autoclip-ai", "generated video B-roll was not ready, rendering without it", err);
    void falCancel(req);
    return false;
  }
}

/** Cut a shot out of the source (no audio) and store it as an insert. */
export async function materializeSourceCutaway(args: {
  videoPath: string;
  startSec: number;
  endSec: number;
  userId: string;
  projectId: string;
  clip: number;
}): Promise<string | null> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "broll-src-"));
  try {
    const out = path.join(tmp, "cutaway.mp4");
    await runFFmpegArgs([
      "-y", "-ss", String(args.startSec), "-to", String(args.endSec), ...ffmpegInputArgs(args.videoPath),
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", out,
    ], 120_000);
    return await uploadFileToS3(out, brollKey(args.userId, args.projectId, `c${args.clip}-src`), "video/mp4");
  } catch (err) {
    logger.warn("autoclip-ai", "source cutaway extraction failed", err);
    return null;
  } finally {
    fs.rmSync(/*turbopackIgnore: true*/ tmp, { recursive: true, force: true });
  }
}

/** A still from the source at `tSec`, for the ranker to look at. */
export async function extractFrame(videoPath: string, tSec: number, outPath: string): Promise<boolean> {
  try {
    await runFFmpegArgs([
      "-y", "-ss", String(Math.max(0, tSec)), ...ffmpegInputArgs(videoPath), "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", outPath,
    ], 30_000);
    return fs.existsSync(/*turbopackIgnore: true*/ outPath);
  } catch {
    return false;
  }
}
