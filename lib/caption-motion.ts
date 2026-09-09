// What a caption's per-word motion is: energy, emphasis, emoji, keyword colour.
//
// This existed twice, and the two copies disagreed:
//
//   1. The renderer (autoclip-pipeline) built energy + emoji + keyword colour.
//   2. The still-frame preview (autoclip-preview) built energy ONLY — under a
//      comment claiming "identical style resolution to the renderer", which
//      meant a preview of an emoji template showed no emoji and a template
//      with a keyword colour previewed without it.
//
// Both also nested the whole block inside `if (signal && signal.energy.length)`.
// Energy needs a signal track; emoji and keyword colour do not — they are
// properties of the TEMPLATE. So a clip whose signal track was missing or empty
// silently rendered an emoji template with no emoji at all, and nothing in the
// UI could have told you why.

import { planEmoji, type CaptionTemplate } from "@/lib/caption-templates";
import { sampleAt, type SignalTrack } from "@/lib/signal-track";
import type { CaptionMotion } from "@/utils/ffmpeg-render";
import type { WordTiming } from "@/utils/elevenlabs";

/**
 * Returns the motion block for a clip, or undefined when there is nothing to
 * say — in which case the caller leaves `style.motion` unset and the ASS
 * builder falls back to its neutral defaults, exactly as before.
 */
export function captionMotion(
  words: WordTiming[],
  template: CaptionTemplate | null | undefined,
  signal: SignalTrack | null | undefined,
): CaptionMotion | undefined {
  const emoji = planEmoji(words, template?.emoji ?? false);
  const hasEmoji = Object.keys(emoji).length > 0;
  const hasSignal = Boolean(signal && signal.energy?.length);
  const keywordColor = template?.keywordColor;

  if (!hasSignal && !hasEmoji && !keywordColor) return undefined;

  return {
    ...(hasSignal && signal
      ? {
          energy: words.map((w) => sampleAt(signal.energy, w.start / 1000, signal.hz)),
          emphasis: signal.emphasis ?? [],
          wordsPerSec: signal.wordsPerSec,
        }
      : {}),
    ...(hasEmoji ? { emoji } : {}),
    ...(keywordColor ? { keywordColor } : {}),
  };
}
