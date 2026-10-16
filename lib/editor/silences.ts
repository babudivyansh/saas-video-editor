// Turns silences found in a clip's source media into timeline cuts.
// Pure and client-safe.

import type { VideoClip } from "./types";
import type { TimeRange } from "./ripple-cut";

/**
 * `silences` are in the clip's SOURCE seconds. Each becomes a timeline range,
 * shrunk by `keepSec` on both sides so words don't get clipped, and dropped if
 * what's left is shorter than `minCutSec`.
 */
export function silencesToCuts(clip: VideoClip, silences: TimeRange[], keepSec = 0.15, minCutSec = 0.2): TimeRange[] {
  const speed = clip.speed ?? 1;
  const srcEnd = clip.srcIn + clip.duration * speed;
  const cuts: TimeRange[] = [];
  for (const s of silences) {
    const from = Math.max(s.start, clip.srcIn);
    const to = Math.min(s.end, srcEnd);
    if (to <= from) continue;
    const start = clip.timelineStart + (from - clip.srcIn) / speed + keepSec;
    const end = clip.timelineStart + (to - clip.srcIn) / speed - keepSec;
    if (end - start >= minCutSec) cuts.push({ start, end });
  }
  return cuts;
}
