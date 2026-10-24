// What a caption's per-word motion is: energy, emphasis, pace and emoji.
//
// One function so the renderer, the still-frame preview and the dub path all
// agree. Energy needs a signal track; emoji do not (they are a property of the
// template), so a clip with no signal track still gets its emoji.

import { planEmoji } from "@clipiro/shared/caption-emoji";
import type { CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { sampleAt, type SignalTrack } from "@/lib/signal-track";
import type { WordTiming } from "@/utils/elevenlabs";

export interface ClipCaptionMotion {
  energy?: number[];
  emphasis?: number[];
  wordsPerSec?: number;
  emoji: Record<number, string>;
}

export function captionMotion(
  words: WordTiming[],
  template: CaptionTemplateSpec | null | undefined,
  signal: SignalTrack | null | undefined,
): ClipCaptionMotion {
  const emoji = planEmoji(words, !!template && template.emoji !== "none");
  if (!signal || !signal.energy?.length) return { emoji };
  return {
    energy: words.map((w) => sampleAt(signal.energy, w.start / 1000, signal.hz)),
    emphasis: signal.emphasis ?? [],
    wordsPerSec: signal.wordsPerSec,
    emoji,
  };
}
