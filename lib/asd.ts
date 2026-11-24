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
//   ASD (GPU)  ->  Rekognition (AWS, only if gpu_routing.rekognitionFallback)
//              ->  Gemini on sampled frames (needs the local source file)
//              ->  []  (static centre crop, `failure` set)
// which is the same contract lib/reframe.ts already documents for Rekognition
// alone, just with one more rung on top.

import { runAsd, GpuServiceError } from "@/lib/gpu-service";
import { shouldUseAsd, shouldUseRekognitionFallback } from "@/lib/render-target";
import { detectFaceTimeline, type FaceBox, type FaceTimelineResult } from "@/lib/reframe";
import { classifySource } from "@/lib/source-url";
import { detectFacesWithGemini } from "@/lib/face-detect-gemini";
import { logger } from "@/lib/logger";

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
export async function getFaceTimeline(
  userId: string,
  videoUrl: string,
  /**
   * The already-downloaded (ownership-checked) source, for the Gemini rung.
   * Without it there is no rung below Rekognition.
   */
  local?: { path: string; durationSec: number },
): Promise<FaceTimelineResult> {
  // ── AUTHORIZATION GATE ─────────────────────────────────────────────────────
  // This must stand on its own. Both steps below spend Clipiro's credentials on
  // whatever object `videoUrl` names — ASD by minting a presigned GET,
  // Rekognition by handing bucket/key straight to our own IAM — and `videoUrl`
  // reaches here as `project.uploadedVideoUrl`, which is client-settable.
  //
  // It was previously un-gated. Nothing was exploitable in practice only
  // because AutoClip's ownership-checked source download runs earlier in the
  // same try block and fails first on a foreign key. That is execution order,
  // not authorization: reordering those steps, adding a second caller, or
  // calling this function directly would all have reopened it. See
  // docs/source-url-tenant-isolation-incident.md.
  //
  // `userId` is the project owner, read server-side. It was already an
  // argument here, but only ever fed shouldUseAsd() — a rollout flag, not a
  // permission.
  // One-hour grant: the GPU service is a third party, so it gets the shortest
  // lifetime that still covers a long analysis — unchanged from before the gate.
  const source = await classifySource(videoUrl, userId, 60 * 60);
  if (source.kind === "foreign") {
    logger.error("asd", "refusing face detection for media this user does not own", { userId });
    return { boxes: [], failure: "unconfigured" };
  }

  if (await shouldUseAsd(userId)) {
    try {
      // The GPU service holds no AWS credentials, so it gets a short-lived
      // presigned URL rather than the bucket path. An external source is
      // fetched by the GPU service directly — no Clipiro credential involved.
      const signed = source.kind === "owned" ? source.url : videoUrl;
      const result = await runAsd(signed);
      const boxes = asdTracksToFaceBoxes(result);
      if (boxes.length > 0) {
        logger.info("asd", `ASD produced ${boxes.length} samples across ${result.tracks.length} track(s)`);
        return { boxes };
      }
      logger.warn("asd", "ASD returned no tracks, falling back to Rekognition");
    } catch (err) {
      // An "input"-class failure means the media itself is the problem, so
      // Rekognition would very likely fail too. This must never be the thing
      // that fails a render.
      const cls = err instanceof GpuServiceError ? err.errorClass : "transport";
      logger.warn("asd", `ASD unavailable (${cls}), falling back to Rekognition`, err);
    }
  }
  // Rekognition is NOT cheap: it bills $0.10 per minute of the whole source,
  // ~9x the rest of an AutoClip run combined. It runs only when an admin has
  // turned the fallback on (gpu_routing.rekognitionFallback); otherwise the
  // Gemini rung below runs, and the centre crop only when that fails too.
  //
  // Rekognition reads the object with OUR IAM credentials, so it runs only for
  // media we have proven the user owns. An external URL is not a Rekognition
  // input in the first place (the job takes an S3 object in our own account),
  // so skipping it changes no working behaviour — it just stops us handing an
  // attacker-influenced bucket/key pair to AWS on our own credentials.
  let last: FaceTimelineResult = { boxes: [], failure: "unconfigured" };
  if (source.kind === "owned" && (await shouldUseRekognitionFallback())) {
    last = await detectFaceTimeline(videoUrl);
    if (!last.failure) return last;
  }
  // Gemini on sampled frames of the local copy. Production runs with neither
  // of the rungs above configured, which made every AutoClip run a centre
  // crop with `reframe_failed` (2026-11). The file was downloaded through the
  // ownership-checked path, and the gate above already refused foreign media.
  if (local) {
    const gemini = await detectFacesWithGemini(local.path, local.durationSec);
    if (!gemini.failure) return gemini;
    last = gemini;
  }
  return last;
}

