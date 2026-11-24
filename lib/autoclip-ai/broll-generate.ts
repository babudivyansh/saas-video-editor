// AutoClip B-roll, generated. Since 2026-11-21 this is the ONLY B-roll
// AutoClip makes: stock footage (the first Pexels result, unseen, and in
// landscape for vertical clips) was removed because it so rarely matched.
//
//   * ai_image (default): a fal image model draws a still for the sentence,
//     and ffmpeg turns it into a short clip with a slow camera move. Seconds
//     and a fraction of a cent.
//   * ai_video (Agency, user opt-in): a fal video model. Slow (often minutes)
//     and priced per clip, so it is only SUBMITTED during analysis — the
//     render polls for it and skips the window if it isn't ready, so it can
//     never hold a run up.
//
// Everything stored here goes under broll/{userId}/... in our own bucket, so
// the render presigns it exactly like the source video.

import type { ReframeAspect } from "@/lib/reframe";
import fs from "fs";
import os from "os";
import path from "path";
import { falSubmit, falPollUntilDone, falCancel, extractResultUrl, type FalRequest } from "@/lib/fal";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { downloadFile } from "@/utils/download";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { isAllowedStockHost } from "@/lib/stock-hosts";
import { TARGET_RES } from "@/lib/reframe";
import type { AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import type { AiBudget } from "@/lib/autoclip-ai/budget";

type Aspect = ReframeAspect;

export function falConfigured(): boolean {
  return Boolean(env.FAL_KEY);
}

/**
 * The prompt for one cutaway still. Text in generated images is the usual
 * giveaway (garbled letters), so it is ruled out explicitly; people are kept
 * out of frame because a generated face next to the real speaker reads as a
 * second, fake person.
 */
export function cutawayPrompt(queries: string[], sentence: string): string {
  const shot = (queries[0] ?? "").trim() || sentence.slice(0, 120);
  return `${shot}. Photorealistic cinematic still, natural light, shallow depth of field, rich but realistic colour, ` +
    `illustrating what is being said: "${sentence.slice(0, 200)}". ` +
    `No text, no letters, no captions, no logos, no watermark, no close-up human faces.`;
}

/**
 * Roughly one megapixel in the clip's own shape (dimensions divisible by 16).
 * fal's preset sizes are smaller (576x1024 for portrait), which goes soft once
 * upscaled to 1080x1920 and zoomed into.
 */
export const IMAGE_SIZE: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 768, height: 1344 },
  "16:9": { width: 1344, height: 768 },
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 896, height: 1120 },
};

function brollKey(userId: string, projectId: string, tag: string): string {
  // The user id as a path segment is what lets ownsKey (lib/source-url.ts)
  // prove ownership and presign it at render time.
  return `broll/${userId}/${projectId}/${tag}-${Date.now().toString(36)}.mp4`;
}

/** The camera moves a still can get. Varied per window so inserts don't all look alike. */
export const STILL_MOTIONS = ["push_in", "pan_right", "pull_out", "pan_left"] as const;
export type StillMotion = (typeof STILL_MOTIONS)[number];

export function motionFor(windowIndex: number, clipIndex: number): StillMotion {
  return STILL_MOTIONS[(windowIndex + clipIndex) % STILL_MOTIONS.length];
}

/** zoompan z/x/y expressions for a move over `frames` frames. */
export function motionExprs(motion: StillMotion, frames: number): { z: string; x: string; y: string } {
  const p = `(on/${Math.max(1, frames)})`; // progress 0 -> 1
  const centreX = "iw/2-(iw/zoom/2)", centreY = "ih/2-(ih/zoom/2)";
  switch (motion) {
    case "push_in": return { z: `1+0.10*${p}`, x: centreX, y: centreY };
    case "pull_out": return { z: `1.10-0.10*${p}`, x: centreX, y: centreY };
    // A held 1.08 zoom gives the pan room to travel without showing an edge.
    case "pan_right": return { z: "1.08", x: `(iw-iw/zoom)*${p}`, y: centreY };
    case "pan_left": return { z: "1.08", x: `(iw-iw/zoom)*(1-${p})`, y: centreY };
  }
}

/** ffmpeg arguments that turn a still into a clip with a slow camera move, at the clip's output size. */
export function stillMotionArgs(imagePath: string, outPath: string, aspect: Aspect, durationSec: number, motion: StillMotion = "push_in"): string[] {
  const { w, h } = TARGET_RES[aspect];
  const fps = 30;
  const frames = Math.max(1, Math.round(durationSec * fps));
  const m = motionExprs(motion, frames);
  // Scale up first so zoompan has pixels to move across without stepping
  // (zoompan rounds to whole pixels, which judders on a small image).
  const vf = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
    `zoompan=z='${m.z}':d=${frames}:x='${m.x}':y='${m.y}':s=${w}x${h}:fps=${fps},format=yuv420p`;
  return [
    "-y", "-loop", "1", "-i", imagePath, "-t", durationSec.toFixed(2), "-vf", vf,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", outPath,
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
  motion?: StillMotion;
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
    const raw = await falPollUntilDone(req, { deadlineMs: 90_000, pollIntervalMs: 1500 });
    const url = extractResultUrl(raw, ["images.0.url", "image.url"]);
    const img = path.join(tmp, "still.img");
    await downloadFile(url, img, undefined, { allowHost: (h: string) => isAllowedStockHost(h, "fal") });
    const out = path.join(tmp, "broll.mp4");
    // A touch longer than the window, so the splice never runs short.
    const seconds = Math.max(1.5, Math.min(5, args.durationSec + 0.3));
    await runFFmpegArgs(stillMotionArgs(img, out, args.aspect, seconds, args.motion), 120_000);
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
