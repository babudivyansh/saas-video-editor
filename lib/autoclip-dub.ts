// Multi-language dubbing (AutoClip P2.2). Wires up the ElevenLabs dubbing API
// (utils/elevenlabs.ts — already implemented, was previously unused by
// AutoClip) to a rendered Clip: start a dub job, poll until the translated
// audio track is ready, then mux it over the existing video (captions stay in
// the source language for v1 — re-aligning them would mean re-running STT on
// the dubbed audio, a known scoping limitation shared by several competitors).

import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/utils/download";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { startDubbing, getDubbingStatus, getDubbedAudio } from "@/utils/elevenlabs";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";

export interface DubPayload { projectId: string; clipDubId: string }

export const DUB_CREDIT_COST = 1;

const MAX_POLL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

export async function dubJob(payload: DubPayload): Promise<void> {
  const { clipDubId } = payload;
  const dub = await prisma.clipDub.findUnique({ where: { id: clipDubId }, include: { clip: true } });
  if (!dub) throw new Error(`ClipDub ${clipDubId} not found`);
  if (!dub.clip.videoUrl) throw new Error(`Clip ${dub.clipId} has no rendered video to dub`);

  const tmp = os.tmpdir();
  const dubbedAudioPath = path.join(tmp, `${clipDubId}-dub-audio.mp3`);
  const sourceVideoPath = path.join(tmp, `${clipDubId}-dub-src.mp4`);
  const outputPath = path.join(tmp, `${clipDubId}-dubbed.mp4`);

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

    await runFFmpegArgs([
      "-y", "-i", sourceVideoPath, "-i", dubbedAudioPath,
      "-map", "0:v", "-map", "1:a",
      "-c:v", "copy", "-c:a", "aac", "-shortest",
      outputPath,
    ]);

    const videoUrl = await uploadFileToS3(outputPath, `renders/${dub.clip.projectId}/clip-${dub.clip.index}-${dub.targetLang}.mp4`, "video/mp4");
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "ready", videoUrl } });
  } catch (err) {
    logger.error("auto-clip-dub", `dub ${clipDubId} failed`, err);
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "failed" } }).catch(() => {});
  } finally {
    for (const f of [dubbedAudioPath, sourceVideoPath, outputPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}
