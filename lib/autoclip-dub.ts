// Multi-language dubbing (AutoClip P2.2). Wires up the ElevenLabs dubbing API
// (utils/elevenlabs.ts) to a rendered Clip: start a dub job, poll until the translated
// audio track is ready, then translate the subtitle transcript via Gemini, generate
// the translated ASS subtitle file, and burn it into the dubbed video.

import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/utils/download";
import { runFFmpegArgs, styleIndexToSubtitleStyle, generateASS } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { startDubbing, getDubbingStatus, getDubbedAudio } from "@/utils/elevenlabs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import type { WordTiming } from "@/utils/elevenlabs";
import type { SubtitleStyle } from "@/utils/ffmpeg-render";
import os from "os";
import path from "path";
import fs from "fs";

export interface DubPayload { projectId: string; clipDubId: string }

export const DUB_CREDIT_COST = 1;

const MAX_POLL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

const LANG_MAP: Record<string, string> = {
  bg: "Bulgarian", zh: "Chinese", hr: "Croatian", cs: "Czech", da: "Danish",
  nl: "Dutch", en: "English", fi: "Finnish", fr: "French", de: "German",
  el: "Greek", hi: "Hindi", hu: "Hungarian", id: "Indonesian", it: "Italian",
  ja: "Japanese", ko: "Korean", ms: "Malay", pl: "Polish", pt: "Portuguese",
  ro: "Romanian", ru: "Russian", sk: "Slovak", es: "Spanish", sv: "Swedish",
  tr: "Turkish", uk: "Ukrainian", vi: "Vietnamese"
};

async function translateTranscript(words: WordTiming[], targetLang: string): Promise<WordTiming[]> {
  if (words.length === 0) return [];
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const targetLangName = LANG_MAP[targetLang] ?? targetLang;
  const inputData = words.map((w) => ({ word: w.word, start: w.start, end: w.end }));
  const prompt = `You are a professional video translator. Translate this list of words with timestamps into ${targetLangName}.
You MUST preserve the timeline structure. Maintain the timing constraints so the translated words align correctly with the audio.
Return ONLY a valid JSON array of objects with the exact same keys: [{"word": "translated_word", "start": start_ms, "end": end_ms}].
Do not include any explanation or markdown block wrappers.

Input JSON:
${JSON.stringify(inputData)}`;

  const result = await withRetry((signal) => model.generateContent(prompt, { signal }), { timeoutMs: 30_000 });
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON array for translation");
  const translated = JSON.parse(jsonMatch[0]) as WordTiming[];
  return translated;
}

export async function dubJob(payload: DubPayload): Promise<void> {
  const { clipDubId } = payload;
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
        let style = styleIndexToSubtitleStyle(dub.clip.captionStyleIndex ?? 0, "oneword");
        const customStyle = dub.clip.subtitleStyleOverride as unknown as SubtitleStyle | null;
        if (customStyle) {
          style = { ...style, ...customStyle };
        }
        generateASS(translatedWords, style, assPath);
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
    await prisma.clipDub.update({ where: { id: clipDubId }, data: { status: "failed" } }).catch(() => {});
  } finally {
    for (const f of [dubbedAudioPath, sourceVideoPath, outputPath, assPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}
