// A clip's caption track: which template, which user tweaks, which words.
//
// Shared by every path that burns captions into an AutoClip clip (the render,
// the still-frame preview, the dub) so they can't disagree about the look.

import { resolveCaptionTemplate, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { captionMotion } from "@/lib/caption-motion";
import { sanitizeCaptionWord } from "@/lib/caption-sanitize";
import { templateIdForIndex } from "@/lib/captions/legacyStyleIndex";
import type { SignalTrack } from "@/lib/signal-track";
import type { WordTiming } from "@/utils/elevenlabs";
import { buildCaptionTrack, type CaptionTrack } from "./engine";

/** The per-clip caption settings stored in Clip.subtitleStyleOverride. */
export interface CaptionOverride {
  templateId: string | null;
  /** #RRGGBB replacing the template's accent colour. */
  accent: string | null;
  /** 0.7–1.4 multiplier on the template's size. */
  sizeScale: number;
  /** Block centre, % of frame height, when the user chose one. */
  positionY: number | null;
  /** Face-aware default written at pick time (lib/captions/position.ts). */
  faceY: number | null;
}

/**
 * Reads Clip.subtitleStyleOverride. Older rows carry font/colour fields from
 * the retired style editor; those are ignored.
 */
export function readCaptionOverride(raw: unknown): CaptionOverride {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const accent = typeof o.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(o.accent) ? o.accent : null;
  const sizeScale = num(o.sizeScale);
  const positionY = num(o.positionY);
  const faceY = num(o.captionPositionY);
  return {
    templateId: typeof o.templateId === "string" && o.templateId ? o.templateId : null,
    accent,
    sizeScale: sizeScale != null ? Math.min(1.4, Math.max(0.7, sizeScale)) : 1,
    positionY: positionY != null ? Math.min(85, Math.max(15, positionY)) : null,
    faceY: faceY != null ? Math.min(85, Math.max(15, faceY)) : null,
  };
}

/** The template a clip renders with: its saved id, else its legacy index, else the default. */
export function clipTemplate(override: CaptionOverride, captionStyleIndex: number | null | undefined): CaptionTemplateSpec {
  return resolveCaptionTemplate(override.templateId ?? templateIdForIndex(captionStyleIndex ?? 0));
}

export interface ClipCaptionInput {
  words: WordTiming[];
  subtitleStyleOverride: unknown;
  captionStyleIndex: number | null | undefined;
  signal: SignalTrack | null;
  W: number;
  H: number;
  durationMs: number;
}

/** Builds the caption track for a clip, or null when there are no words. */
export function buildClipCaptionTrack(input: ClipCaptionInput): CaptionTrack | null {
  const words = input.words
    .map((w) => ({ ...w, word: sanitizeCaptionWord(w.word).trim() }))
    .filter((w) => w.word.length > 0);
  if (!words.length) return null;
  const override = readCaptionOverride(input.subtitleStyleOverride);
  const template = clipTemplate(override, input.captionStyleIndex);
  const motion = captionMotion(words, template, input.signal);
  return buildCaptionTrack({
    words,
    template,
    W: input.W,
    H: input.H,
    durationMs: input.durationMs,
    accent: override.accent,
    sizeScale: override.sizeScale,
    // An explicit position always wins. Otherwise the template's placement
    // applies, except that centred templates move to the face-aware spot so
    // they don't sit on the speaker's face; low and high templates are
    // already clear of it by design.
    positionY: override.positionY ?? (template.placement.y === "mid" ? override.faceY : null),
    energy: motion.energy,
    emphasis: motion.emphasis,
    wordsPerSec: motion.wordsPerSec,
    emoji: motion.emoji,
    rms: input.signal?.rms?.length ? { hz: input.signal.hz, values: input.signal.rms } : null,
  });
}
