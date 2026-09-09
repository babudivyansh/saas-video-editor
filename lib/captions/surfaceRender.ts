// Premium caption rendering for the single-video products.
//
// AutoClip renders a clip, then hands the finished MP4 to a provider. These
// three products (reddit-video, split-screen, streamer-video) composite and
// burn captions in ONE ffmpeg pass, so there was never a clean video to hand
// over. Adding one is the whole change, and it has to be done in an order that
// cannot leave a user with a video that has no captions at all:
//
//   1. planSurfaceCaptions() BEFORE the ffmpeg pass — checks the same gates the
//      render path will (flag, tier, breaker, configured, prior failure). If it
//      says defer, the pass omits `subtitles=`.
//   2. upload the composited video, so the product is complete either way.
//   3. requestSurfaceCaptionRender() AFTER — charges, then submits.
//   4. If THAT falls back (no credits, or a gate flipped in between), the
//      caller still holds its temp files and burns the captions locally in a
//      second pass. Rare, and costs one extra encode rather than an
//      uncaptioned video.
//
// Step 4 is the reason this is two functions rather than one: the fallback has
// to happen where the temp files are.

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getUserTier } from "@/lib/auth";
import { shouldDeferCaptionsToProvider } from "./deferral";
import { requestCaptionRender } from "@/lib/caption-render-job";
import type { WordTiming } from "@/utils/elevenlabs";
import type { Prisma } from "@prisma/client";

export interface SurfaceCaptionPlan {
  /** True = leave captions out of the ffmpeg pass; a provider will add them. */
  defer: boolean;
}

/**
 * Decides, before the render, whether a provider is going to caption this.
 *
 * Never throws and never returns true on uncertainty — burning captions is
 * always the safe answer, because a missing animation is a smaller failure
 * than a missing caption.
 */
export async function planSurfaceCaptions(input: {
  projectId: string;
  userId: string;
  templateId: string | null | undefined;
  durationSec?: number;
}): Promise<SurfaceCaptionPlan> {
  if (!input.templateId) return { defer: false };
  try {
    const tier = await getUserTier(input.userId);
    const defer = await shouldDeferCaptionsToProvider({
      projectId: input.projectId,
      templateId: input.templateId,
      tier,
      durationSec: input.durationSec,
    });
    return { defer };
  } catch (err) {
    logger.warn("captions", `deferral planning failed for ${input.projectId}`, err);
    return { defer: false };
  }
}

export type SurfaceRenderOutcome =
  | { submitted: true }
  /** The caller must burn captions itself — reason is for logging only. */
  | { submitted: false; reason: string };

/**
 * Stores the canonical transcript and asks for the paid render.
 *
 * The transcript write is not incidental: it is what a premium reddit-video
 * render is built on. Those word timings come from ElevenLabs alignment of the
 * script the user typed, and pushing them to the provider before the export
 * (lib/caption-render-job.ts) is what stops the provider's re-transcription of
 * its own output replacing exact text — usernames and post titles included —
 * with an ASR guess.
 */
export async function requestSurfaceCaptionRender(input: {
  projectId: string;
  userId: string;
  templateId: string;
  durationSec: number;
  words: WordTiming[];
}): Promise<SurfaceRenderOutcome> {
  try {
    if (input.words.length > 0) {
      await prisma.project.update({
        where: { id: input.projectId },
        data: { captionsJson: input.words as unknown as Prisma.InputJsonValue },
      });
    }

    const result = await requestCaptionRender({
      projectId: input.projectId,
      userId: input.userId,
      templateId: input.templateId,
      durationSec: input.durationSec,
    });

    if (result.ok) return { submitted: true };

    // Every one of these is a legitimate outcome, not an error: the product
    // still ships, with the template's native look burned in by the caller.
    logger.info("captions", `provider render declined for project ${input.projectId}: ${result.reason}`);
    return { submitted: false, reason: result.reason };
  } catch (err) {
    logger.error("captions", `provider render request failed for ${input.projectId}`, err);
    return { submitted: false, reason: "request_failed" };
  }
}
