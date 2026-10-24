// Ground-truth preview frames for a clip.
//
// Renders single frames through the SAME crop/caption/grade/watermark chain
// the real render uses, so what the user approves is what they get. The
// alternatives both misrepresent the output: the source-video preview shows
// none of the reframing or captions, and a DOM-composited preview would be a
// hand-written reimplementation of ffmpeg's filter semantics that drifts from
// the renderer without anyone noticing.

import { type Clip } from "@prisma/client";
import { downloadFile } from "@/utils/download";
import { runFFmpegArgs, maybeUseFilterScript } from "@/utils/ffmpeg-render";
import { buildDynamicCropFilter, TARGET_RES, type StoredCrop } from "@/lib/reframe";
import { FILTER_PRESETS, type FilterPreset } from "@/lib/editor/types";
import { type SignalTrack } from "@/lib/signal-track";
import { type WordTiming } from "@/utils/elevenlabs";
import { buildClipCaptionTrack } from "@/lib/captions/clip-captions";
import { buildCaptionFilterChain, type CaptionTrack } from "@/lib/captions/engine";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";

const MOODS = ["energetic", "calm", "dramatic", "funny", "neutral"] as const;
const MOOD_TO_FILTER: Record<(typeof MOODS)[number], FilterPreset> = {
  energetic: "vivid", calm: "softGlow", dramatic: "noir", funny: "warm", neutral: "none",
};

/** Preview width; tall enough to judge framing and caption legibility. */
const PREVIEW_W = 405;

function aspectRatioFilter(ratio: string): string {
  if (ratio === "16:9") return "crop=in_w:in_w*9/16";
  if (ratio === "1:1") return "crop=in_h:in_h";
  return "crop=in_h*9/16:in_h";
}

export interface PreviewFrame { atSec: number; dataUrl: string }

/**
 * Render start / middle / end frames for a clip. Returns whatever succeeded —
 * a partial preview is more useful than an error, and this must never be able
 * to fail a render or a save.
 */
export async function renderPreviewFrames(sourceUrl: string, clip: Clip): Promise<PreviewFrame[]> {
  const tmp = os.tmpdir();
  const id = `${clip.id}-${Date.now()}`;
  const sourcePath = path.join(tmp, `preview-${id}.mp4`);
  const assPath = path.join(tmp, `preview-${id}.ass`);
  const scriptPath = path.join(tmp, `preview-${id}.filter`);
  const cleanup: string[] = [sourcePath, assPath, scriptPath];

  try {
    await downloadFile(sourceUrl, sourcePath);

    const aspect = clip.aspectRatio || "9:16";
    const stored = clip.cropKeyframes as unknown as StoredCrop | null;
    const words = clip.transcriptJson as unknown as WordTiming[] | null;
    const signal = clip.signalTrack as unknown as SignalTrack | null;

    // Captions: the same track the renderer builds (lib/captions/clip-captions.ts),
    // so the preview shows the real template, emoji and glass panel.
    const capRes = TARGET_RES[(aspect as "9:16" | "16:9" | "1:1")] ?? TARGET_RES["9:16"];
    let track: CaptionTrack | null = null;
    if (clip.hasCaptions && words && words.length > 0) {
      track = buildClipCaptionTrack({
        words,
        subtitleStyleOverride: clip.subtitleStyleOverride,
        captionStyleIndex: clip.captionStyleIndex,
        signal,
        W: capRes.w,
        H: capRes.h,
        durationMs: clip.durationSec * 1000,
      });
      if (track) fs.writeFileSync(assPath, track.ass);
    }

    const moodKey = (clip.mood && (MOODS as readonly string[]).includes(clip.mood))
      ? (clip.mood as (typeof MOODS)[number]) : "neutral";
    const moodFilter = FILTER_PRESETS[MOOD_TO_FILTER[moodKey]].ffmpeg;

    // Split-screen previews would need the full two-track complex graph; the
    // single-crop path covers it well enough for a still, so fall back to the
    // static crop there rather than shipping a wrong preview.
    const keyframes = stored?.mode === "single" ? stored.keyframes : null;
    const cropExpr = keyframes && keyframes.length > 1
      ? buildDynamicCropFilter(keyframes, aspect as "9:16" | "16:9" | "1:1")
      : aspectRatioFilter(aspect);

    const duration = Math.max(0.1, clip.durationSec);
    const timestamps = [0, duration / 2, Math.max(0, duration - 0.2)];

    const frames: PreviewFrame[] = [];
    for (const [i, atSec] of timestamps.entries()) {
      const outPath = path.join(tmp, `preview-${id}-${i}.jpg`);
      cleanup.push(outPath);
      // -ss before -i restarts timestamps at 0; shift them back to clip time
      // first, so the (clip-relative) crop path and the captions both show
      // what happens at this moment rather than at the clip's first frame.
      const base = [`setpts=PTS+${atSec.toFixed(3)}/TB`, cropExpr, moodFilter].filter((f): f is string => !!f).join(",");
      const graph = track
        ? `[0:v]${base},scale=${capRes.w}:${capRes.h},setsar=1[capin];` +
          buildCaptionFilterChain({ track, assPath, inLabel: "capin", outLabel: "capout" }) +
          `;[capout]scale=${PREVIEW_W}:-2[out]`
        : `[0:v]${base},scale=${PREVIEW_W}:-2[out]`;

      // Seeking to the clip's own start plus the offset means the crop
      // expressions (which are clip-relative) line up with the frame shown.
      const args = maybeUseFilterScript([
        "-y",
        "-ss", String(clip.startSec + atSec),
        "-i", sourcePath,
        "-filter_complex", graph, "-map", "[out]",
        "-frames:v", "1", "-q:v", "4",
        outPath,
      ], scriptPath);

      try {
        await runFFmpegArgs(args, 45_000);
        if (fs.existsSync(outPath)) {
          frames.push({ atSec, dataUrl: `data:image/jpeg;base64,${fs.readFileSync(outPath).toString("base64")}` });
        }
      } catch (err) {
        logger.warn("auto-clip", `preview frame at ${atSec}s failed for clip ${clip.id}`, err);
      }
    }
    return frames;
  } finally {
    for (const f of cleanup) {
      try { if (fs.existsSync(/*turbopackIgnore: true*/ f)) fs.unlinkSync(/*turbopackIgnore: true*/ f); } catch {}
    }
  }
}
