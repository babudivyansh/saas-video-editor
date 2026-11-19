// A source video whose AAC audio track is corrupt must still render.
//
// CLIPIRO-WEB-14 (2026-11-19): every clip of one 81-minute upload, in the
// first render and in every re-render, failed with
//   [aac] channel element 2.1 is not allocated … Reserved bit set …
//   Rematrix is needed between 9 channels and stereo but there is not enough
//   information to do it … Error reinitializing filters! … Conversion failed!
// Parts of the file's AAC stream are corrupt. ffmpeg drops most bad packets,
// but one decodes as a frame claiming 9 (or 21) channels with no channel
// layout. ffmpeg then rebuilds the audio filter graph for the new frame, the
// automatic resampler cannot downmix an unnamed 9-channel layout to stereo,
// and the whole render aborts. ffmpeg 7+ can drop such a frame
// (`-drop_changed`); production runs the pinned 6.0 build, which cannot.
//
// The repair: rebuild the audio once through `pan`, which addresses channels
// by index and so accepts any channel count, layout or none. The video stream
// is copied untouched. Only used after a render has failed this way, so a
// healthy source costs nothing.

import fs from "fs";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";

/** stderr of an ffmpeg run that died on a mid-stream audio channel change it could not convert. */
export function isCorruptAudioFailure(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /Rematrix is needed between \d+ channels/i.test(text)
    || /Failed to configure output pad on auto_aresample/i.test(text);
}

const AUDIO_FIX_TIMEOUT_MS = 20 * 60 * 1000;

// One repair per source file, shared by every clip rendering from it.
const g = globalThis as unknown as { __audioSafeSources?: Map<string, Promise<string>> };
const repairs: Map<string, Promise<string>> = (g.__audioSafeSources ??= new Map());

export function audioSafePathFor(videoPath: string): string {
  return `${videoPath}.audiofix.mp4`;
}

async function repair(videoPath: string): Promise<string> {
  const out = audioSafePathFor(videoPath);
  const run = (pan: string) => runFFmpegArgs([
    "-y", "-i", videoPath,
    "-map", "0:v:0?", "-map", "0:a:0",
    "-c:v", "copy",
    "-af", pan,
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    out,
  ], AUDIO_FIX_TIMEOUT_MS);
  try {
    await run("pan=stereo|c0=c0|c1=c1");
  } catch {
    // A mono source has no c1.
    await run("pan=mono|c0=c0");
  }
  return out;
}

/**
 * A copy of `videoPath` with its first audio track rebuilt so it always
 * decodes to a fixed layout. Concurrent callers share one repair.
 */
export function audioSafeSource(videoPath: string): Promise<string> {
  let p = repairs.get(videoPath);
  if (!p) {
    logger.warn("auto-clip", "source audio is corrupt; rebuilding the audio track and rendering again", { videoPath });
    p = repair(videoPath);
    // A failed repair must not be cached: the next clip may retry it.
    p.catch(() => repairs.delete(videoPath));
    repairs.set(videoPath, p);
  }
  return p;
}

/** Deletes the repaired copy, if any. Call where the source itself is deleted. */
export function discardAudioSafeSource(videoPath: string): void {
  repairs.delete(videoPath);
  try { fs.rmSync(audioSafePathFor(videoPath), { force: true }); } catch { /* best-effort */ }
}
