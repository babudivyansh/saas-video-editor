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

/**
 * Picker tabs. Order here is the order they render in.
 *
 * "More" is the rest of the provider's library — the templates nobody has
 * looked at yet, so they get a placeholder look rather than a described one.
 * It is last because a curated category is a better default than a bucket.
 */
export const CAPTION_CATEGORIES = ["Viral", "Creator", "Podcast", "Minimal", "Professional", "More"] as const;
export type CaptionCategory = (typeof CAPTION_CATEGORIES)[number];

export interface CaptionTemplate {
  id: string;
  label: string;
  /** One-line description of when to reach for it. */
  hint: string;
  /**
   * The native ASS look.
   *
   * Every template has one, INCLUDING the provider-rendered ones. That is what
   * makes the premium tier degradable rather than fragile: it drives the
   * instant local preview (§27) and it is what the clip actually renders with
   * if the provider is disabled, unconfigured or down (§31). A provider outage
   * then costs the user the animation, not the export.
   */
  style: SubtitleStyle;
  /** Auto-place emoji on recognised words. */
  emoji: boolean;
  /** Colour applied to LLM-flagged emphasis words, if the template highlights them. */
  keywordColor?: string;

  // ── Provider routing (2026-09 premium captions) ───────────────────────────
  /**
   * Which renderer produces the final export. "native" = the FFmpeg/ASS path
   * that has always shipped; anything else routes through lib/captions.
   * Omitted = "native", so every pre-existing template is unchanged.
   */
  provider?: "native" | "submagic";
  /**
   * The provider's own template name. This is the ONLY place a provider name
   * appears outside the adapter — §4's "create a mapping layer, don't hardcode
   * mappings throughout the app". Validated against the live provider list by
   * lib/captions/templateSync.ts, which disables the template if it vanishes.
   */
  providerTemplateId?: string;
  category?: CaptionCategory;
  premium?: boolean;
  /**
   * Whether `style` is a real approximation of the provider's look, or a
   * stand-in assigned without anyone having seen it.
   *
   * Omitted = true (every hand-written template). false means three things are
   * knowingly wrong until someone looks: the swatch, the hover preview, and —
   * the one that costs something — the FALLBACK render when the provider is
   * off, unconfigured or down. The picker says so rather than letting the user
   * find out from a finished clip.
   */
  lookVerified?: boolean;
  /** Clipiro-owned preview media (S3/CDN). Providers give us no preview assets. */
  previewImageUrl?: string;
  previewVideoUrl?: string;
  sortOrder?: number;
  /** false hides it from the picker without deleting the entry. */
  active?: boolean;
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
const ORANGE = "&H001673F9";
const PURPLE = "&H00F755A8";

/**
 * The hand-written library: 6 native looks and 12 provider templates whose
 * approximation someone actually authored. CAPTION_TEMPLATES appends the rest
 * of the provider's library to this — see REST_OF_LIBRARY below.
 */
const CURATED_TEMPLATES: CaptionTemplate[] = [
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

  // ── Premium: rendered by Submagic ─────────────────────────────────────────
  //
  // These 12 are the curated library (§9). Two things about them are load-bearing:
  //
  //  1. `providerTemplateId` values are REAL — every one was confirmed present
  //     in GET /v1/templates against the live API on 2026-09-06. A name that
  //     later disappears is caught by lib/captions/templateSync.ts, which
  //     deactivates the template rather than letting an export fail at render
  //     time with a provider validation error.
  //  2. `style` is a deliberate NATIVE APPROXIMATION of the provider look, not
  //     decoration. It is what renders when the provider is off or down, and
  //     what the browser preview draws. It will not match the provider's
  //     animation exactly — it can't, that's what the user is paying for — but
  //     font weight, colour and placement carry over so the fallback is
  //     recognisably the style the user picked.
  //
  // previewImageUrl/previewVideoUrl are intentionally unset here: the provider
  // hands us no preview assets, so these are Clipiro-owned media added via the
  // `caption_templates` Config overlay once recorded, with no code change.
  //
  // `label` deliberately MIRRORS the provider's own template name (product
  // decision, 2026-09-08) so what a user picks here reads the same as what they
  // see in the provider's dashboard. It is still a display string, NOT the
  // routing key — `providerTemplateId` is what the adapter sends, and the two
  // are free to diverge the day a template is re-pointed at a different
  // provider. `hint` carries the description the name no longer does, which is
  // why the picker surfaces it on hover.
  {
    id: "viral-bold-01",
    label: "Hormozi 1",
    hint: "Heavy all-caps with a green pop. The default short-form look.",
    style: { fontName: "Impact", fontSize: 92, baseColor: WHITE, highlightColor: GREEN, outlineColor: BLACK, outlineWidth: 10, shadowDepth: 2, alignment: 5, animated: true },
    emoji: true, keywordColor: GREEN,
    provider: "submagic", providerTemplateId: "Hormozi 1",
    category: "Viral", premium: true, sortOrder: 10, active: true,
  },
  {
    id: "viral-bold-02",
    label: "Hormozi 2",
    hint: "Same energy, yellow highlight. Reads well over busy footage.",
    style: { fontName: "Impact", fontSize: 92, baseColor: WHITE, highlightColor: YELLOW, outlineColor: BLACK, outlineWidth: 10, shadowDepth: 2, alignment: 5, animated: true },
    emoji: true, keywordColor: YELLOW,
    provider: "submagic", providerTemplateId: "Hormozi 2",
    category: "Viral", premium: true, sortOrder: 20, active: true,
  },
  {
    id: "viral-punch",
    label: "Hormozi 3",
    hint: "Tighter, punchier cadence with an orange accent.",
    style: { fontName: "Anton", fontSize: 88, baseColor: WHITE, highlightColor: ORANGE, outlineColor: BLACK, outlineWidth: 9, shadowDepth: 2, alignment: 5, animated: true },
    emoji: true, keywordColor: ORANGE,
    provider: "submagic", providerTemplateId: "Hormozi 3",
    category: "Viral", premium: true, sortOrder: 30, active: true,
  },
  {
    id: "viral-beast",
    label: "Beast",
    hint: "Maximum contrast and scale. Built for challenge and reaction content.",
    style: { fontName: "Anton", fontSize: 96, baseColor: WHITE, highlightColor: YELLOW, outlineColor: BLACK, outlineWidth: 12, shadowDepth: 3, alignment: 5, animated: true },
    emoji: true, keywordColor: YELLOW,
    provider: "submagic", providerTemplateId: "Beast",
    category: "Viral", premium: true, sortOrder: 40, active: true,
  },
  {
    id: "high-energy",
    label: "Hormozi 5",
    hint: "Fast, saturated, keyword-heavy. Suits gaming and hype edits.",
    style: { fontName: "Montserrat", fontSize: 86, baseColor: WHITE, highlightColor: PINK, outlineColor: BLACK, outlineWidth: 9, shadowDepth: 3, alignment: 5, animated: true },
    emoji: true, keywordColor: PINK,
    provider: "submagic", providerTemplateId: "Hormozi 5",
    category: "Viral", premium: true, sortOrder: 50, active: true,
  },
  {
    id: "creator-modern",
    label: "Ali",
    hint: "Clean sans with a soft highlight. The safe premium default.",
    style: { fontName: "Poppins", fontSize: 74, baseColor: WHITE, highlightColor: CYAN, outlineColor: BLACK, outlineWidth: 7, alignment: 5, animated: true },
    emoji: false, keywordColor: CYAN,
    provider: "submagic", providerTemplateId: "Ali",
    category: "Creator", premium: true, sortOrder: 60, active: true,
  },
  {
    id: "creator-pop",
    label: "Maya",
    hint: "Rounded and friendly with a purple accent. Lifestyle and vlog.",
    style: { fontName: "Poppins", fontSize: 78, baseColor: WHITE, highlightColor: PURPLE, outlineColor: BLACK, outlineWidth: 8, shadowDepth: 2, alignment: 5, animated: true },
    emoji: true, keywordColor: PURPLE,
    provider: "submagic", providerTemplateId: "Maya",
    category: "Creator", premium: true, sortOrder: 70, active: true,
  },
  {
    id: "podcast-bold",
    label: "Carlos",
    hint: "Lower-third that stays clear of the speaker's face.",
    style: { fontName: "Poppins", fontSize: 64, baseColor: WHITE, highlightColor: CYAN, outlineColor: BLACK, borderStyle: 3, outlineWidth: 4, alignment: 2, animated: true },
    emoji: false, keywordColor: CYAN,
    provider: "submagic", providerTemplateId: "Carlos",
    category: "Podcast", premium: true, sortOrder: 80, active: true,
  },
  {
    id: "clean-minimal",
    label: "Sara",
    hint: "Small and quiet. For talking-head content that carries itself.",
    style: { fontName: "Poppins", fontSize: 58, baseColor: WHITE, highlightColor: WHITE, outlineColor: BLACK, outlineWidth: 5, alignment: 2, animated: true },
    emoji: false,
    provider: "submagic", providerTemplateId: "Sara",
    category: "Minimal", premium: true, sortOrder: 90, active: true,
  },
  {
    id: "clean-white",
    label: "Leila",
    hint: "Pure white, centred, no colour. Maximum legibility.",
    style: { fontName: "Montserrat", fontSize: 70, baseColor: WHITE, highlightColor: WHITE, outlineColor: BLACK, outlineWidth: 6, alignment: 5, animated: true },
    emoji: false,
    provider: "submagic", providerTemplateId: "Leila",
    category: "Minimal", premium: true, sortOrder: 100, active: true,
  },
  {
    id: "luxury-clean",
    label: "Iman",
    hint: "Restrained serif with a gold accent. Premium and brand-safe.",
    style: { fontName: "Playfair Display", fontSize: 66, baseColor: WHITE, highlightColor: YELLOW, outlineColor: BLACK, outlineWidth: 5, alignment: 2, animated: true },
    emoji: false, keywordColor: YELLOW,
    provider: "submagic", providerTemplateId: "Iman",
    category: "Professional", premium: true, sortOrder: 110, active: true,
  },
  {
    id: "professional-01",
    label: "David",
    hint: "Neutral, corporate-safe lower third. For explainers and B2B.",
    style: { fontName: "Outfit", fontSize: 62, baseColor: WHITE, highlightColor: CYAN, outlineColor: BLACK, borderStyle: 3, outlineWidth: 4, alignment: 2, animated: false },
    emoji: false, keywordColor: CYAN,
    provider: "submagic", providerTemplateId: "David",
    category: "Professional", premium: true, sortOrder: 120, active: true,
  },
];

// ── The rest of the provider's library ──────────────────────────────────────
//
// GET /v1/templates returns 45 names; the 12 above are the ones someone sat
// down and wrote an approximation for. These are the other 33, added so the
// picker offers the whole library the account already pays for.
//
// Their `style` is a PLACEHOLDER, not an approximation. The API gives us a bare
// name — no font, no colour, no preview image (verified 2026-09-06 and again
// 2026-09-08) — so nobody has seen these looks, and a look nobody has seen
// cannot be described honestly. The families below exist so the grid is
// legible and the swatches are distinguishable; the rotation carries NO claim
// that "Jess" is teal. That is what `lookVerified: false` records, and the
// picker shows it.
//
// Two consequences, both real:
//   1. swatch and hover preview show the placeholder, labelled as one;
//   2. if the provider is off, unconfigured, tier-ineligible or down, the clip
//      renders in the placeholder look — captions, but not the ones picked.
//
// To fix one properly: replace its entry with a hand-written template above
// (or a `caption_templates` Config override) and drop lookVerified.
//
// Fonts are restricted to the six bundled in public/fonts plus Impact. A font
// the render host cannot resolve falls back to libass's default, which would
// make the placeholder wrong in a second, less visible way.
const PLACEHOLDER_LOOKS = {
  bold: { fontName: "Impact", fontSize: 92, baseColor: WHITE, highlightColor: YELLOW, outlineColor: BLACK, outlineWidth: 10, shadowDepth: 2, alignment: 5, animated: true },
  punch: { fontName: "Anton", fontSize: 88, baseColor: WHITE, highlightColor: ORANGE, outlineColor: BLACK, outlineWidth: 9, shadowDepth: 2, alignment: 5, animated: true },
  modern: { fontName: "Poppins", fontSize: 74, baseColor: WHITE, highlightColor: CYAN, outlineColor: BLACK, outlineWidth: 7, alignment: 5, animated: true },
  clean: { fontName: "Montserrat", fontSize: 70, baseColor: WHITE, highlightColor: WHITE, outlineColor: BLACK, outlineWidth: 6, alignment: 5, animated: true },
  lower: { fontName: "Poppins", fontSize: 64, baseColor: WHITE, highlightColor: CYAN, outlineColor: BLACK, borderStyle: 3, outlineWidth: 4, alignment: 2, animated: true },
  serif: { fontName: "Playfair Display", fontSize: 66, baseColor: WHITE, highlightColor: YELLOW, outlineColor: BLACK, outlineWidth: 5, alignment: 2, animated: true },
  condensed: { fontName: "Oswald", fontSize: 84, baseColor: WHITE, highlightColor: GREEN, outlineColor: BLACK, outlineWidth: 8, shadowDepth: 2, alignment: 5, animated: true },
  bebas: { fontName: "Bebas Neue", fontSize: 88, baseColor: WHITE, highlightColor: PINK, outlineColor: BLACK, outlineWidth: 9, shadowDepth: 2, alignment: 5, animated: true },
} satisfies Record<string, SubtitleStyle>;

export type PlaceholderLook = keyof typeof PLACEHOLDER_LOOKS;

/** Which legacy index each placeholder family maps onto (see lib/captions/legacyStyleIndex.ts). */
export const PLACEHOLDER_LOOK_INDEX: Record<PlaceholderLook, number> = {
  bold: 13, punch: 10, modern: 0, clean: 0, lower: 1, serif: 12, condensed: 6, bebas: 6,
};

interface RestEntry {
  /** EXACTLY the provider's template name — this is what gets sent on create. */
  name: string;
  look: PlaceholderLook;
  /** Display name, when the provider's own casing would read as a typo. */
  label?: string;
  category?: CaptionCategory;
  sortOrder?: number;
  emoji?: boolean;
  hint?: string;
}

const PLACEHOLDER_HINT = "Partner style — the swatch is a stand-in, not the real look.";

const REST_OF_LIBRARY: RestEntry[] = [
  // The one informed guess in the whole list: Hormozi 4 sits in a family we
  // HAVE mapped four times, so it gets that family's look, its category and
  // its emoji behaviour — and still not a verified look, because nobody has
  // seen this specific one either.
  {
    name: "Hormozi 4", look: "bold", category: "Viral", sortOrder: 35, emoji: true,
    hint: "Same family as the other Hormozi looks; the swatch is a stand-in.",
  },
  // Everything else. sortOrder is left at the shared default so they fall in
  // label order within "More" — a 32-item bucket is navigated by name, and any
  // ranking here would be another thing invented.
  { name: "Matt", look: "bold" },
  { name: "Jess", look: "punch" },
  { name: "Jack", look: "modern" },
  { name: "Nick", look: "clean" },
  { name: "Laura", look: "lower" },
  { name: "Kelly 2", look: "serif" },
  { name: "Claire", look: "condensed" },
  { name: "Michael", look: "bebas" },
  { name: "Caleb", look: "bold" },
  { name: "Kendrick", look: "punch" },
  { name: "Lewis", look: "modern" },
  { name: "Doug", look: "clean" },
  { name: "Luke", look: "lower" },
  { name: "Mark", look: "serif" },
  { name: "Daniel", look: "condensed" },
  { name: "Dan 2", look: "bebas" },
  { name: "Dan", look: "bold" },
  { name: "Devin", look: "punch" },
  { name: "Tayo", look: "modern" },
  { name: "Ella", look: "clean" },
  { name: "Tracy", look: "lower" },
  { name: "Jason", look: "serif" },
  { name: "William", look: "condensed" },
  { name: "Leon", look: "bebas" },
  { name: "Bob", look: "bold" },
  { name: "Karl", look: "punch" },
  { name: "Umi", look: "modern" },
  { name: "Noah", look: "clean" },
  { name: "Gstaad", look: "lower" },
  { name: "Malta", look: "serif" },
  { name: "Nema", look: "condensed" },
  // The provider returns this one lower-case. The name on the wire must stay
  // exactly as they spell it; only the display label is title-cased, or it
  // reads as a bug in our own grid.
  { name: "seth", look: "bebas", label: "Seth" },
];

/** Provider name -> slug. "Kelly 2" -> "kelly-2". Stable: it is stored on clips. */
export function providerNameToSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const REST_TEMPLATES: CaptionTemplate[] = REST_OF_LIBRARY.map((e) => ({
  id: providerNameToSlug(e.name),
  label: e.label ?? e.name,
  hint: e.hint ?? PLACEHOLDER_HINT,
  style: PLACEHOLDER_LOOKS[e.look],
  emoji: e.emoji ?? false,
  provider: "submagic" as const,
  providerTemplateId: e.name,
  category: e.category ?? "More",
  premium: true,
  lookVerified: false,
  sortOrder: e.sortOrder ?? 200,
  active: true,
}));

export const CAPTION_TEMPLATES: CaptionTemplate[] = [...CURATED_TEMPLATES, ...REST_TEMPLATES];

/** The placeholder family each unverified template was assigned, by slug. */
export const PLACEHOLDER_LOOK_BY_ID: Record<string, PlaceholderLook> = Object.fromEntries(
  REST_OF_LIBRARY.map((e) => [providerNameToSlug(e.name), e.look]),
);

/** Templates whose final render goes through an external provider. */
export function isProviderTemplate(t: CaptionTemplate): boolean {
  return (t.provider ?? "native") !== "native";
}

/**
 * Same question, by slug — for callers that only have the id (the create route
 * pricing a run before any clip exists). Unknown slugs are treated as native,
 * so a typo can never silently price a run as premium.
 */
export function isPremiumTemplateId(id: string | null | undefined): boolean {
  if (!id) return false;
  const t = CAPTION_TEMPLATES.find((x) => x.id === id);
  return t ? isProviderTemplate(t) : false;
}

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
