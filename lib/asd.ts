// Active-speaker detection, and the resolver that decides where a face
// timeline comes from.
//
// Rekognition gives bounding boxes plus a per-frame MouthOpen boolean, which
// the reframe code was using as a "who is talking" signal. It isn't one — it
// fires on anyone whose mouth happens to be open, so on a two-person clip the
// crop follows whoever is chewing. Light-ASD (the TalkNet-ASD lineage) scores
// speaking probability per tracked face from correlated audio and lip motion,
// which is the actual signal, and its tracker gives stable per-person
// identities so multi-speaker clustering stops being a guess about horizontal
// position.
//
// Everything here is best-effort and degrades in three steps:
//   ASD (GPU)  ->  Rekognition (AWS)  ->  []  (static centre crop)
// which is the same contract lib/reframe.ts already documents for Rekognition
// alone, just with one more rung on top.

import { runAsd, GpuServiceError } from "@/lib/gpu-service";
import { shouldUseAsd } from "@/lib/render-target";
import { detectFaceTimeline, parseS3Url, type FaceBox } from "@/lib/reframe";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

export const ASD_MIN_CONFIDENCE = 0.5;

/**
 * Flattens the ASD service's per-track output into the flat FaceBox[] the
 * reframe pipeline already consumes, preserving track identity and speaking
 * score as optional fields. Timelines cached before ASD existed simply lack
 * them, which every consumer must treat as "no signal" rather than "false" —
 * the same rule the existing mouthOpen field documents.
 */
export function asdTracksToFaceBoxes(result: {
  tracks: { trackId: string; samples: { t: number; x: number; y: number; w: number; h: number; conf: number; speaking: number }[] }[];
}): FaceBox[] {
  const boxes: FaceBox[] = [];
  for (const track of result.tracks) {
    for (const s of track.samples) {
      boxes.push({
        tSec: s.t,
        x: s.x, y: s.y, w: s.w, h: s.h,
        // reframe.ts filters on confidence >= 60 on a 0..100 scale; ASD
        // reports 0..1, so rescale rather than silently dropping every face.
        confidence: Math.round(s.conf * 100),
        speaking: s.speaking,
        trackId: track.trackId,
      });
    }
  }
  return boxes.sort((a, b) => a.tSec - b.tSec);
}

/**
 * Resolve a face timeline for a source video, preferring ASD.
 *
 * Returns [] rather than throwing on any failure: a missing timeline means the
 * renderer uses a static centre crop, which is a visual downgrade, never an
 * error.
 */
export async function getFaceTimeline(userId: string, videoUrl: string): Promise<FaceBox[]> {
  if (await shouldUseAsd(userId)) {
    try {
      // The GPU service holds no AWS credentials, so it gets a short-lived
      // presigned URL rather than the bucket path.
      const loc = parseS3Url(videoUrl);
      const signed = loc ? await getAssetReadUrl(loc.key, 60 * 60) : videoUrl;
      const result = await runAsd(signed);
      const boxes = asdTracksToFaceBoxes(result);
      if (boxes.length > 0) {
        logger.info("asd", `ASD produced ${boxes.length} samples across ${result.tracks.length} track(s)`);
        return boxes;
      }
      logger.warn("asd", "ASD returned no tracks, falling back to Rekognition");
    } catch (err) {
      // An "input"-class failure means the media itself is the problem, so
      // Rekognition will very likely fail too — but it's cheap to let it try,
      // and this must never be the thing that fails a render.
      const cls = err instanceof GpuServiceError ? err.errorClass : "transport";
      logger.warn("asd", `ASD unavailable (${cls}), falling back to Rekognition`, err);
    }
  }
  return detectFaceTimeline(videoUrl);
}

/**
 * True when the timeline carries real speaking scores, i.e. came from ASD.
 * Callers use this to pick between the ASD-aware and heuristic code paths
 * without threading a flag through every function.
 */
export function hasSpeakingSignal(faces: FaceBox[]): boolean {
  return faces.some((f) => typeof f.speaking === "number");
}
