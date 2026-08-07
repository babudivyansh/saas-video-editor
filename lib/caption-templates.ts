// Caption templates: named, opinionated looks rather than a pile of colour
// pickers.
//
// AutoClip had 16 style presets that differed only in font and two colours,
// and — separately — lib/caption-styles.ts held a SECOND, independently
// maintained 16-entry table for the client preview. Two tables describing the
// same thing is a drift bug waiting to happen, so templates are defined once,
// here, and both surfaces read them.
//
// Emoji support comes from the same place: a template can auto-place an emoji
// on words it recognises, which is table stakes for short-form and was the
// single most visible gap against Submagic and Opus.

import type { SubtitleStyle } from "@/utils/ffmpeg-render";

export interface CaptionTemplate {
  id: string;
  label: string;
  /** One-line description of when to reach for it. */
  hint: string;
  style: SubtitleStyle;
  /** Auto-place emoji on recognised words. */
  emoji: boolean;
  /** Colour applied to LLM-flagged emphasis words, if the template highlights them. */
  keywordColor?: string;
}

// ASS colours are &HBBGGRR — the byte order is reversed from hex, which is the
// most common source of "why is my red blue" bugs here.
const WHITE = "&H00FFFFFF";
const BLACK = "&H00000000";
const YELLOW = "&H0015CCFA";
const GREEN = "&H004ADE80";
const CYAN = "&H00EED322";
const PINK = "&H00D4B5C4";
const RED = "&H004444EF";

export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: "clean",
    label: "Clean",
    hint: "Neutral white with a heavy outline. Reads on any footage.",
    style: { fontName: "Outfit", fontSize: 80, baseColor: WHITE, highlightColor: YELLOW, outlineColor: BLACK, outlineWidth: 8, alignment: 5, animated: true },
    emoji: false,
    keywordColor: YELLOW,
  },
  {
    id: "hormozi",
    label: "Bold Impact",
    hint: "Big, loud, all-caps energy. The default short-form look.",
    style: { fontName: "Impact", fontSize: 92, baseColor: WHITE, highlightColor: GREEN, outlineColor: BLACK, outlineWidth: 10, shadowDepth: 2, alignment: 5, animated: true },
    emoji: true,
    keywordColor: GREEN,
  },
  {
    id: "podcast",
    label: "Podcast",
    hint: "Lower-third box that stays out of the speaker's face.",
    style: { fontName: "Poppins", fontSize: 64, baseColor: WHITE, highlightColor: CYAN, outlineColor: BLACK, borderStyle: 3, outlineWidth: 4, alignment: 2, animated: true },
    emoji: false,
    keywordColor: CYAN,
  },
  {
    id: "minimal",
    label: "Minimal",
    hint: "Small, quiet, no animation. For talking-head content that carries itself.",
    style: { fontName: "Poppins", fontSize: 56, baseColor: WHITE, highlightColor: WHITE, outlineColor: BLACK, outlineWidth: 4, alignment: 2, animated: false },
    emoji: false,
  },
  {
    id: "neon",
    label: "Neon",
    hint: "High-contrast pink and cyan. Suits gaming and music.",
    style: { fontName: "Montserrat", fontSize: 84, baseColor: WHITE, highlightColor: PINK, outlineColor: BLACK, outlineWidth: 9, shadowDepth: 3, alignment: 5, animated: true },
    emoji: true,
    keywordColor: PINK,
  },
  {
    id: "news",
    label: "Headline",
    hint: "Serif, restrained, credible. For explainers and commentary.",
    style: { fontName: "Playfair Display", fontSize: 68, baseColor: WHITE, highlightColor: RED, outlineColor: BLACK, outlineWidth: 6, alignment: 2, animated: true },
    emoji: false,
    keywordColor: RED,
  },
];

export function getCaptionTemplate(id: string | null | undefined): CaptionTemplate | null {
  if (!id) return null;
  return CAPTION_TEMPLATES.find((t) => t.id === id) ?? null;
}

// ── Emoji ───────────────────────────────────────────────────────────────────
//
// Deliberately a small, curated map rather than an LLM call per clip: emoji
// placement is decoration, and a wrong-but-confident emoji is worse than none.
// Matching is on whole words only, so "assessment" never becomes "ass 🍑".

const EMOJI_MAP: Record<string, string> = {
  money: "💰", cash: "💰", dollars: "💰", revenue: "📈", profit: "📈", growth: "📈",
  fire: "🔥", insane: "🔥", crazy: "🤯", mind: "🤯", shocking: "😱",
  love: "❤️", best: "🏆", win: "🏆", winning: "🏆", first: "🥇",
  time: "⏰", fast: "⚡", quick: "⚡", instantly: "⚡",
  idea: "💡", think: "🤔", question: "❓", secret: "🤫", warning: "⚠️",
  stop: "🛑", boom: "💥", huge: "🚀", massive: "🚀", launch: "🚀",
  laugh: "😂", funny: "😂", happy: "😊", sad: "😢", angry: "😡",
  brain: "🧠", strong: "💪", work: "💼", team: "🤝", data: "📊",
};

const MAX_EMOJI_PER_CLIP = 6;
const MIN_WORDS_BETWEEN_EMOJI = 8;

/**
 * Choose which words get an emoji.
 *
 * Rate-limited on purpose: an emoji on every recognised word turns captions
 * into confetti and hurts the readability the animation work exists to
 * protect. Returns a map of word index → emoji.
 */
export function planEmoji(words: { word: string }[], enabled: boolean): Record<number, string> {
  if (!enabled) return {};
  const out: Record<number, string> = {};
  let placed = 0;
  let lastIndex = -Infinity;

  for (let i = 0; i < words.length && placed < MAX_EMOJI_PER_CLIP; i++) {
    if (i - lastIndex < MIN_WORDS_BETWEEN_EMOJI) continue;
    const key = words[i].word.toLowerCase().replace(/[^a-z]/g, "");
    const emoji = EMOJI_MAP[key];
    if (!emoji) continue;
    out[i] = emoji;
    placed++;
    lastIndex = i;
  }
  return out;
}
