// Stage 5 — following a subject that isn't a face.
//
// Active-speaker detection only knows faces. For a shot Gemini labelled
// "product" (an object, hands, a demo) it drew the subject's box; SAM 2 on the
// GPU service tracks that box through the shot, and the camera path solver
// (camera-path.ts) frames it. One GPU job per clip, covering all its shots.

import { logger } from "@/lib/logger";
import { isGpuConfigured, runTrack, type TrackSeed } from "@/lib/gpu-service";
import type { AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import type { AiBudget } from "@/lib/autoclip-ai/budget";
import type { SceneShot, SubjectTrack } from "@/lib/autoclip-ai/types";

/** Shots worth tracking: a non-face subject Gemini was confident about. */
export function trackableShots(scenes: SceneShot[], minConfidence = 70): SceneShot[] {
  return scenes.filter((s) => s.type === "product" && s.subjectBox && s.confidence >= minConfidence && s.endSec - s.startSec >= 1);
}

export async function trackClipSubjects(args: {
  /** A URL the GPU service can fetch (presigned for our bucket). */
  videoUrl: string;
  clipStartSec: number;
  scenes: SceneShot[];
  clip: number;
  cfg: AutoClipAiConfig;
  budget: AiBudget;
}): Promise<SubjectTrack[] | null> {
  if (!isGpuConfigured()) return null;
  const shots = trackableShots(args.scenes);
  if (shots.length === 0) return null;
  const minutes = shots.reduce((s, x) => s + (x.endSec - x.startSec), 0) / 60;
  if (!args.budget.tryReserve("subject_track", args.cfg.unitCostUsd.gpuTrackPerMin * Math.max(0.1, minutes), args.clip)) return null;
  const seeds: TrackSeed[] = shots.map((s) => ({
    startSec: args.clipStartSec + s.startSec,
    endSec: args.clipStartSec + s.endSec,
    box: s.subjectBox!,
  }));
  try {
    const res = await runTrack(args.videoUrl, seeds);
    return res.tracks
      .filter((t) => t.samples.length >= 2)
      .map((t) => ({
        startSec: t.startSec - args.clipStartSec,
        endSec: t.endSec - args.clipStartSec,
        samples: t.samples.map((s) => ({ t: Math.round((s.t - args.clipStartSec) * 1000) / 1000, x: s.x, y: s.y, w: s.w, h: s.h })),
      }));
  } catch (err) {
    logger.warn("autoclip-ai", `subject tracking failed for clip ${args.clip}`, err);
    return null;
  }
}
