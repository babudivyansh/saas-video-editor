// Multi-language dubbing (AutoClip P2.2). Wires up the ElevenLabs dubbing API
// (utils/elevenlabs.ts) to a rendered Clip: start a dub job, then — once
// ElevenLabs finishes — translate the subtitle transcript via Gemini,
// generate the translated ASS subtitle file, and burn it into the dubbed
// video.
//
// Split into two phases (2026-09-01, ElevenLabs backlog Part B) so the queue
// worker isn't pinned for up to 10 minutes per dub waiting on ElevenLabs:
//   - startDubJob: enqueue-time work only — call startDubbing(), persist the
//     returned dubbingId, return immediately.
//   - finishDubJob: the actual post-processing (download dubbed audio,
//     translate + align captions, burn in, upload, mark ready). Triggered
//     either by the completion webhook (app/api/webhooks/elevenlabs/route.ts
//     — IF ElevenLabs Dubbing actually supports one; unconfirmed as of this
//     writing, see that route's own doc comment) or by lib/cron/dub-sweep.ts
//     polling ElevenLabs directly — whichever notices completion first.
// claimAndEnqueueFinish is the single, shared idempotency guard both of
// those triggers go through, so a redelivered webhook and a cron pass that
// both notice the same completed dub can't both trigger finishDubJob.

import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/utils/download";
import { runFFmpegArgs, styleIndexToSubtitleStyle, generateASS } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { startDubbing, getDubbingStatus, getDubbedAudio, forcedAlign } from "@/utils/elevenlabs";
import { translateTranscript } from "@/lib/caption-translate";
import { restoreSpend } from "@/lib/credits";
import { createRenderQueue } from "@/lib/render-queue";
import { logger } from "@/lib/logger";
import type { WordTiming } from "@/utils/elevenlabs";
import type { SubtitleStyle } from "@/utils/ffmpeg-render";
import os from "os";
import path from "path";
import fs from "fs";

export interface DubPayload {
  projectId: string;
  clipDubId: string;
  /** Who paid for this dub and the ledger refId spendCredits used, both
   * threaded through from the route handler — the job runs later, out of
   * request scope, so neither is otherwise recoverable if it fails before
   * userId/refId are persisted onto the ClipDub row (see below). */
  userId: string;
  refId: string;
}

/** Same shape as DubPayload — kept as its own named type because the two
 * phases run through separate queues with separate retry semantics, and
 * because the fallback cron constructs an equivalent object purely from the
 * ClipDub row (userId/refId columns), never from a real enqueue payload. */
export type FinishDubPayload = DubPayload;

/**
 * Dubbing is billed per minute of clip, not per dub.
 *
 * It shipped at a flat 1 credit regardless of clip length, against an ElevenLabs
 * Dubbing call whose cost scales with audio duration — the same shape as the
 * pre-audit `ai-creator` price (flat 2cr against an uncapped $1-2 call) that the
 * 2026-07 audit had already fixed by going duration-scaled and Pro-gating. A
 * 3-minute dub and a 10-second one cost us very different amounts and charged
 * the customer identically.
 *
 * The rate lives in the admin-editable AutoClip pricing config rather than here,
 * for the same reason the rest of the AutoClip rates do: nobody in this file can
 * responsibly invent a final price, but it should at least be a business
 * decision made through an admin control instead of a code deploy. The default
 * below is deliberately conservative and the feature is Pro-gated until the real
 * ElevenLabs per-minute figure is confirmed — see TOOL_COSTS["clip-dub"].
 */
export function computeDubCost(durationSec: number, dubPerMinute: number): number {
  // Always at least one minute's worth: a 4-second dub still spins up a full
  // ElevenLabs job.
  return Math.max(1, Math.ceil(Math.max(durationSec, 0) / 60) * dubPerMinute);
}

// Two separate queues (not one) so a stuck/slow finish phase for one dub
// can't block a different dub's start phase, and so admin ops/heartbeats can
// tell the two phases apart. Defined here, not in the route, so
// claimAndEnqueueFinish (below) can enqueue onto dubFinishQueue without a
// route → lib → route circular import.
export const dubStartQueue = createRenderQueue<DubPayload>("auto-clip-dub", startDubJob);
export const dubFinishQueue = createRenderQueue<FinishDubPayload>("auto-clip-dub-finish", finishDubJob);

export async function startDubJob(payload: DubPayload): Promise<void> {
  const { clipDubId, userId, refId } = payload;
  const dub = await prisma.clipDub.findUnique({ where: { id: clipDubId }, include: { clip: true } });
  if (!dub) throw new Error(`ClipDub ${clipDubId} not found`);
  if (!dub.clip.videoUrl) throw new Error(`Clip ${dub.clipId} has no rendered video to dub`);

  // Retry guard: a previous attempt may have already called startDubbing()
  // successfully and persisted dubbingId before this attempt (a BullMQ retry
  // after a crash, say) — don't mint a second ElevenLabs dub job for the
  // same request.
  if (dub.dubbingId) return;

  try {
    const { dubbingId } = await startDubbing(dub.clip.videoUrl, dub.targetLang);
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { dubbingId } });
    // status stays "dubbing" (the column default) — completion is detected
    // later, by the webhook or lib/cron/dub-sweep.ts, not here.
  } catch (err) {
    logger.error("auto-clip-dub", `dub ${clipDubId} failed to start`, err);
    await restoreSpend({ userId, refId, reason: "refund:auto-clip-dub-failed" }).catch((e) =>
      logger.error("auto-clip-dub", `refund failed for ${clipDubId}`, e),
    );
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "failed" } }).catch(() => {});
  }
}

/**
 * Atomically claims a ClipDub row for finishing (status "dubbing" →
 * "processing") and enqueues finishDubJob if the claim wins the race.
 * Shared by the completion webhook and lib/cron/dub-sweep.ts so both go
 * through the exact same idempotency guard — whichever notices completion
 * first wins; the other's claim attempt is a no-op (returns false).
 */
export async function claimAndEnqueueFinish(dub: {
  id: string;
  userId: string | null;
  refId: string | null;
  clip: { projectId: string };
}): Promise<boolean> {
  const claimed = await prisma.clipDub.updateMany({
    where: { id: dub.id, status: "dubbing" },
    data: { status: "processing" },
  });
  if (claimed.count === 0) return false;

  if (!dub.userId || !dub.refId) {
    // Should be impossible for any row created after the userId/refId
    // migration — logged rather than silently proceeding, since finishDubJob
    // can't refund correctly on failure without these.
    logger.error("auto-clip-dub", `ClipDub ${dub.id} claimed for finishing but missing userId/refId`);
  }

  await dubFinishQueue.enqueue(dub.id, {
    projectId: dub.clip.projectId,
    clipDubId: dub.id,
    userId: dub.userId ?? "",
    refId: dub.refId ?? "",
  });
  return true;
}

export async function finishDubJob(payload: FinishDubPayload): Promise<void> {
  const { clipDubId, userId, refId } = payload;
  const dub = await prisma.clipDub.findUnique({ where: { id: clipDubId }, include: { clip: true } });
  if (!dub) throw new Error(`ClipDub ${clipDubId} not found`);
  if (!dub.dubbingId) throw new Error(`ClipDub ${clipDubId} has no dubbingId — startDubJob never completed`);

  const tmp = os.tmpdir();
  const dubbedAudioPath = path.join(tmp, `${clipDubId}-dub-audio.mp3`);
  const sourceVideoPath = path.join(tmp, `${clipDubId}-dub-src.mp4`);
  const outputPath = path.join(tmp, `${clipDubId}-dubbed.mp4`);
  const assPath = path.join(tmp, `${clipDubId}-dub-sub.ass`);

  try {
    // Defense in depth: don't trust whatever triggered this call (a webhook
    // payload's own status field, or the cron's last-seen status) — re-check
    // directly against ElevenLabs before doing any real work. Inside this
    // try so an ElevenLabs-reported failure below hits the catch's
    // refund-and-fail path instead of leaving the row stranded at
    // "processing" with credits unrefunded.
    const status = await getDubbingStatus(dub.dubbingId);
    if (status === "failed") throw new Error("ElevenLabs dubbing job failed");
    if (status !== "dubbed") {
      // Premature notification (e.g. a webhook firing on an intermediate
      // state change, not just completion) — revert the claim so the normal
      // dub-sweep polling picks this row back up later, rather than leaving
      // it stranded at "processing". A plain `return` here exits the try
      // without hitting the catch block below, so this is deliberately not
      // treated as a failure (no refund).
      logger.warn("auto-clip-dub", `finishDubJob ${clipDubId} called before ElevenLabs reports "dubbed" (status: ${status}); reverting claim`);
      await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "dubbing" } }).catch(() => {});
      return;
    }

    const audioBuffer = await getDubbedAudio(dub.dubbingId, dub.targetLang);
    fs.writeFileSync(dubbedAudioPath, audioBuffer);
    await downloadFile(dub.clip.videoUrl!, sourceVideoPath);

    let hasCaptions = dub.clip.hasCaptions;
    const words = dub.clip.transcriptJson as unknown as WordTiming[] | null;

    if (hasCaptions && words && words.length > 0) {
      try {
        const translatedWords = await translateTranscript(words, dub.targetLang);

        // translateTranscript's timing is a heuristic (normaliseSpan in
        // lib/caption-translate.ts) — real alignment against the actual
        // dubbed audio is strictly better when it succeeds. Its own
        // try/catch, separate from this block's: a forced-alignment failure
        // should fall back to the heuristic timing (still real captions),
        // not disable captions entirely the way any other error here does.
        let alignedWords = translatedWords;
        try {
          const aligned = await forcedAlign(audioBuffer, translatedWords.map((w) => w.word).join(" "));
          if (aligned.length > 0) alignedWords = aligned;
        } catch (err) {
          logger.warn("auto-clip-dub", `Forced alignment failed for ${clipDubId}, using heuristic timing`, err);
        }

        let style = styleIndexToSubtitleStyle(dub.clip.captionStyleIndex ?? 0, "oneword");
        const customStyle = dub.clip.subtitleStyleOverride as unknown as SubtitleStyle | null;
        if (customStyle) {
          style = { ...style, ...customStyle };
        }
        generateASS(alignedWords, style, assPath);
      } catch (err) {
        hasCaptions = false;
        logger.warn("auto-clip-dub", `Subtitle translation failed for ${clipDubId}, rendering without subtitles`, err);
      }
    }

    if (hasCaptions && fs.existsSync(assPath)) {
      const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      await runFFmpegArgs([
        "-y", "-i", sourceVideoPath, "-i", dubbedAudioPath,
        "-filter_complex", `[0:v]subtitles='${assEscaped}'[v]`,
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
        "-c:a", "aac", "-shortest",
        outputPath,
      ]);
    } else {
      await runFFmpegArgs([
        "-y", "-i", sourceVideoPath, "-i", dubbedAudioPath,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-shortest",
        outputPath,
      ]);
    }

    const videoUrl = await uploadFileToS3(outputPath, `renders/${dub.clip.projectId}/clip-${dub.clip.index}-${dub.targetLang}.mp4`, "video/mp4");
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "ready", videoUrl } });
  } catch (err) {
    logger.error("auto-clip-dub", `dub ${clipDubId} failed to finish`, err);
    await restoreSpend({ userId, refId, reason: "refund:auto-clip-dub-failed" }).catch((e) =>
      logger.error("auto-clip-dub", `refund failed for ${clipDubId}`, e),
    );
    // Safe unconditional update — this row is already claimed to
    // "processing" (checked above), so there's no concurrent claimant to
    // race with here.
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "failed" } }).catch(() => {});
  } finally {
    for (const f of [dubbedAudioPath, sourceVideoPath, outputPath, assPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}
