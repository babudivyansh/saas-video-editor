// Multi-language dubbing (AutoClip P2.2). Wires up the ElevenLabs dubbing API
// (utils/elevenlabs.ts) to a rendered Clip: start a dub job, poll until the translated
// audio track is ready, then translate the subtitle transcript via Gemini, generate
// the translated ASS subtitle file, and burn it into the dubbed video.

import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/utils/download";
import { runFFmpegArgs, styleIndexToSubtitleStyle, generateASS } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { startDubbing, getDubbingStatus, getDubbedAudio, forcedAlign } from "@/utils/elevenlabs";
import { translateTranscript } from "@/lib/caption-translate";
import { restoreSpend } from "@/lib/credits";
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
   * threaded through from the route handler — dubJob runs later, out of
   * request scope, so neither is otherwise recoverable if the job fails. */
  userId: string;
  refId: string;
}

export const DUB_CREDIT_COST = 1;

const MAX_POLL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

// Transcript translation lives in lib/caption-translate.ts. It used to be
// private to this file, which meant subtitles in another language could only
// be had by also paying for a dubbed voice track — and gave the codebase a
// third, unreconciled language list.

export async function dubJob(payload: DubPayload): Promise<void> {
  const { clipDubId, userId, refId } = payload;
  const dub = await prisma.clipDub.findUnique({ where: { id: clipDubId }, include: { clip: true } });
  if (!dub) throw new Error(`ClipDub ${clipDubId} not found`);
  if (!dub.clip.videoUrl) throw new Error(`Clip ${dub.clipId} has no rendered video to dub`);

  const tmp = os.tmpdir();
  const dubbedAudioPath = path.join(tmp, `${clipDubId}-dub-audio.mp3`);
  const sourceVideoPath = path.join(tmp, `${clipDubId}-dub-src.mp4`);
  const outputPath = path.join(tmp, `${clipDubId}-dubbed.mp4`);
  const assPath = path.join(tmp, `${clipDubId}-dub-sub.ass`);

  try {
    const { dubbingId } = await startDubbing(dub.clip.videoUrl, dub.targetLang);

    const deadline = Date.now() + MAX_POLL_MS;
    for (;;) {
      const status = await getDubbingStatus(dubbingId);
      if (status === "failed") throw new Error("ElevenLabs dubbing job failed");
      if (status === "dubbed") break;
      if (Date.now() > deadline) throw new Error("Dubbing timed out");
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    const audioBuffer = await getDubbedAudio(dubbingId, dub.targetLang);
    fs.writeFileSync(dubbedAudioPath, audioBuffer);
    await downloadFile(dub.clip.videoUrl, sourceVideoPath);

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
    logger.error("auto-clip-dub", `dub ${clipDubId} failed`, err);
    await restoreSpend({ userId, refId, reason: "refund:auto-clip-dub-failed" }).catch((e) =>
      logger.error("auto-clip-dub", `refund failed for ${clipDubId}`, e),
    );
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "failed" } }).catch(() => {});
  } finally {
    for (const f of [dubbedAudioPath, sourceVideoPath, outputPath, assPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}
