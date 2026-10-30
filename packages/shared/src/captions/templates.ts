// The Clipiro caption template library: the templates Clipiro owns and renders
// itself (lib/captions/engine on the server, CaptionTemplateRender in the
// browser, a static swatch on mobile).
//
// Pure data on purpose. The web app, the render workers, the editor and the
// Android app all read these exact records, so a template can never look one
// way in the picker and another way in the export. Design reference: the
// "Clipiro Caption Library" plan (2026-10-24; templates 51-150 designed
// 2026-10-30 and shipped in weekly drops of ten).
//
// Every template is one value on each of nine settings: type, words on screen,
// placement, active-word motion, colours, container, emoji, extras, and the
// family/plan it belongs to. The engine implements each setting once.
// scripts/check-caption-templates.mjs keeps the set unique (no two templates
// share font + motion + container + accent) and checks every font is bundled.

export type CaptionTier = "free" | "creator" | "pro";

export type CaptionFamilyId =
  | "viral"
  | "karaoke"
  | "box"
  | "creator"
  | "podcast"
  | "minimal"
  | "cinema"
  | "retro"
  | "desi"
  | "gradient"
  | "chroma"
  | "sticker"
  | "kinetic"
  | "letters"
  | "neon"
  | "y2k"
  | "hype"
  | "soft"
  | "edu"
  | "fest"
  | "season";

/** How the spoken word (or line) animates. Names match the engine registry. */
export type CaptionMotionId =
  | "pop" | "pops" | "slam" | "bounce" | "color" | "dim" | "karaoke" | "boxword"
  | "stack" | "rise" | "fade" | "cut" | "bold" | "emph" | "bubble" | "blocks"
  | "glow" | "marker" | "underline" | "hollow" | "split" | "shake" | "wobble"
  | "blur" | "zoom" | "type" | "typestep" | "flicker" | "step" | "rgb" | "fontswitch"
  | "heartbeat" | "punch" | "drop" | "elastic" | "jelly" | "stamp" | "tiltswap"
  | "flip" | "spin" | "swing" | "slidel" | "extrude" | "tada" | "swipe" | "stretch"
  | "draw" | "flash" | "roll" | "ink" | "shimmer"
  | "wave" | "cascade" | "rainbow" | "scramble" | "slice";

export const CAPTION_MOTIONS: readonly CaptionMotionId[] = [
  "pop", "pops", "slam", "bounce", "color", "dim", "karaoke", "boxword",
  "stack", "rise", "fade", "cut", "bold", "emph", "bubble", "blocks",
  "glow", "marker", "underline", "hollow", "split", "shake", "wobble",
  "blur", "zoom", "type", "typestep", "flicker", "step", "rgb", "fontswitch",
  "heartbeat", "punch", "drop", "elastic", "jelly", "stamp", "tiltswap",
  "flip", "spin", "swing", "slidel", "extrude", "tada", "swipe", "stretch",
  "draw", "flash", "roll", "ink", "shimmer",
  "wave", "cascade", "rainbow", "scramble", "slice",
];

/** Motions that animate each letter of the spoken word on its own. */
export const LETTER_MOTIONS: readonly CaptionMotionId[] = ["wave", "cascade", "rainbow"];

/** The shape the line sits on, if any. */
export type CaptionContainer = "none" | "pill" | "bar" | "line" | "glass" | "sticker" | "dark" | "wordbox";

/**
 * Where a keyword's emoji goes. sticker: a big emoji on a white disc in the
 * top-right corner; flank: either side of the keyword; orbit: circles it.
 */
export type CaptionEmojiMode = "none" | "above" | "end" | "burst" | "rain" | "sticker" | "flank" | "orbit";

/**
 * Decorative symbols, drawn as text glyphs (a symbol font the export bundles),
 * so they cost no image overlays:
 *   sparkle   three glyphs twinkle round the spoken word
 *   flank     a glyph either side of the line, pulsing
 *   badge     a label in a box in the top-left corner, popping in per line
 *   confetti  glyphs burst out of emphasised and emoji words
 *   orbit     a glyph circles the spoken word
 *   prefix    a glyph before each line
 *   stars     a five-star row under the caption fills up as words are spoken
 *   arrow     a glyph points at the spoken word
 */
export type CaptionSymbolMode = "sparkle" | "flank" | "badge" | "confetti" | "orbit" | "prefix" | "stars" | "arrow";

export interface CaptionSymbols {
  mode: CaptionSymbolMode;
  /** The glyphs; for a badge, its label. */
  glyphs: string;
  /** Glyph colours, cycled (badge: the box colour). */
  colors: string[];
}

/** How each line arrives. */
export type CaptionEntry = "up" | "drop" | "swirl";

/** A slow loop on the whole line while it is on screen. */
export type CaptionLoop = "float" | "sway" | "pulse" | "hue" | "breathe";

export type CaptionExtra = "letterbox" | "quote" | "bars" | "square" | "cursor" | "speakers";

export type CaptionPlacement = "high" | "mid" | "low";

/** Colours are #RRGGBB or #RRGGBBAA (alpha last, CSS order). */
export interface CaptionTemplateColors {
  base: string;
  accent: string;
  outline?: string;
  /** Outline weight on a 0-4 scale; the engine converts it per resolution. */
  outlineWidth?: number;
  hardShadow?: string;
  glow?: string;
  box?: string;
  box2?: string;
  /** Per-word fill colours for bubble/blocks, cycled. */
  palette?: string[];
  /** Accent colour rotation, one per spoken word. */
  cycle?: string[];
  /** A fixed colour per word (unspoken and spoken alike), cycled through the clip. */
  wordColors?: string[];
  /** Box colour rotation behind the spoken word (boxword, marker), one per word. */
  boxCycle?: string[];
  /** A colour per letter of the spoken word (rainbow), cycled. */
  letterColors?: string[];
  /** The depth colour of a 3D extruded word. */
  extrude?: string;
  /** Second accent: the offset ghost colour of a glitch slice. */
  accent2?: string;
  /** Text colour per speaker (Two Mic). Index 0 is used when there is no speaker data. */
  speakers?: string[];
  /** Vertical gradient fill: on the spoken word, or on every word. */
  gradient?: { from: string; to: string; target: "active" | "all" };
}

export interface CaptionTemplateSpec {
  id: string;
  name: string;
  family: CaptionFamilyId;
  tier: CaptionTier;
  /** One sentence on what it looks like and when to use it. */
  hint: string;
  /** The market style it was modelled on. */
  benchmark: string;
  type: {
    font: string;
    weight: number;
    italic?: boolean;
    case: "upper" | "lower" | "none";
    /** Size multiplier; 1 = the base caption size. */
    size: number;
    /** Letter spacing in em. */
    tracking?: number;
  };
  /** Words on screen at once. */
  words: number;
  motion: CaptionMotionId;
  placement: { y: CaptionPlacement; align: "center" | "left"; tilt?: number };
  colors: CaptionTemplateColors;
  container: CaptionContainer;
  /** Shape of the spoken word's box (boxword): rounded corners (default) or a full pill. */
  wordBox?: "rounded" | "pill";
  emoji: CaptionEmojiMode;
  symbols?: CaptionSymbols;
  entry?: CaptionEntry;
  loop?: CaptionLoop;
  extra?: CaptionExtra;
  /** The script the template is designed for. Devanagari templates need HarfBuzz shaping. */
  script?: "latin" | "devanagari";
  /** Preview line. "word:🔥" marks the emoji shown in previews; "*word" marks emphasis. */
  sample: string;
}

export interface CaptionFamily {
  id: CaptionFamilyId;
  name: string;
  description: string;
}

export const CAPTION_FAMILIES: readonly CaptionFamily[] = [
  { id: "viral", name: "Viral Bold", description: "Caps, heavy weights, 1 to 3 words. The look that dominates business, motivation and challenge content." },
  { id: "karaoke", name: "Karaoke & Highlight", description: "The line stays put and the highlight travels. Best when viewers read along." },
  { id: "box", name: "Box & Pill", description: "Text sits on a shape, so it reads on busy or bright footage." },
  { id: "creator", name: "Creator & Vlog", description: "Playful type, bounce and emoji for lifestyle, comedy and day-in-the-life." },
  { id: "podcast", name: "Podcast & Interview", description: "Low placement that keeps faces clear; built for two-person conversations." },
  { id: "minimal", name: "Minimal & Pro", description: "Little or no motion. For brands, explainers and anyone who finds the loud styles cheap." },
  { id: "cinema", name: "Cinematic & Editorial", description: "Serifs, tracking and slow fades for storytelling, documentary and luxury." },
  { id: "retro", name: "Gaming & Retro", description: "Pixel, glitch and neon for gaming, tech and music." },
  { id: "desi", name: "Hindi & Hinglish", description: "Designed for Devanagari from the start, for India's biggest creator audience." },
  { id: "gradient", name: "Gradient Pop", description: "Two-stop gradient fills that make the spoken word look lit from inside." },
  { id: "chroma", name: "Colour Switch", description: "A colour per word, changing as you speak. Built for rhythmic clips under 30 seconds." },
  { id: "sticker", name: "Sticker & Badge", description: "Stickers, badges, price tags and star ratings that make a clip look designed, not captioned." },
  { id: "kinetic", name: "Kinetic 3D", description: "Flips, spins, drops, swings and squash-and-stretch. Motion you notice from across the room." },
  { id: "letters", name: "Letter FX", description: "Motion at the letter level: waves, cascades, decoders, rainbow hops and slices." },
  { id: "neon", name: "Neon Night", description: "Tube-light glows and flickers for nightlife, music, gaming and late-night talk." },
  { id: "y2k", name: "Y2K & Chrome", description: "Chrome, glitter, butterflies and flip-phone pixels for the nostalgic edit." },
  { id: "hype", name: "Hype & Sports", description: "Scoreboards, countdowns and impact hits for sport, fitness and competition." },
  { id: "soft", name: "Soft Aesthetic", description: "Quiet lowercase in warm, muted colours with gentle motion." },
  { id: "edu", name: "Explainer & Business", description: "Checklists, steps, stats and pro tips. Motion that helps people follow along." },
  { id: "fest", name: "Desi Festival", description: "Diwali, Holi, cricket and wedding looks, in Devanagari and Hinglish." },
  { id: "season", name: "Celebrations & Drops", description: "Birthdays, New Year, Halloween and winter, for seasonal posts." },
];

const W = "#FFFFFF";
const K = "#000000";

export const CAPTION_TEMPLATES: readonly CaptionTemplateSpec[] = [
  // ── Viral Bold ────────────────────────────────────────────────────────────
  {
    id: "boardroom", name: "Boardroom", family: "viral", tier: "free",
    hint: "Heavy geometric caps, three words at a time. The spoken word pops and turns lime; one emoji lands above the money word.",
    benchmark: "The loud business-podcast look; the most copied style in short form",
    type: { font: "Montserrat", weight: 900, case: "upper", size: 1 }, words: 3, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#B8FF3B", outline: K, outlineWidth: 3 }, container: "none", emoji: "above",
    sample: "Stop:🛑 trading your time for money:💰 and start building assets",
  },
  {
    id: "slam", name: "Slam", family: "viral", tier: "creator",
    hint: "Two words at a time. Each spoken word slams in from 180% and kicks once, in hard yellow.",
    benchmark: "Big-challenge YouTube channels",
    type: { font: "Anton", weight: 400, case: "upper", size: 1.15 }, words: 2, motion: "slam",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: K, outlineWidth: 3 }, container: "none", emoji: "end",
    sample: "I gave away one million:💸 dollars to total strangers",
  },
  {
    id: "megaphone", name: "Megaphone", family: "viral", tier: "creator",
    hint: "A single word on screen that drops in and bounces. The colour rotates through five brights, word after word.",
    benchmark: "One-word-at-a-time motivation edits",
    type: { font: "Archivo Black", weight: 400, case: "upper", size: 1.55 }, words: 1, motion: "bounce",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: K, outlineWidth: 3, cycle: [W, "#FFD60A", "#3BFF8F", "#FF5A5A", "#5AC8FF"] },
    container: "none", emoji: "none",
    sample: "Nobody is coming to save you so move now",
  },
  {
    id: "redbox", name: "Red Box", family: "viral", tier: "free",
    hint: "Tall condensed caps. The spoken word gets a solid red box behind it, like a news alert.",
    benchmark: "Breaking-news reaction clips",
    type: { font: "Bebas Neue", weight: 400, case: "upper", size: 1.25 }, words: 3, motion: "boxword",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, box: "#FF2D2D", outline: K, outlineWidth: 2 }, container: "none", emoji: "none",
    sample: "This changes everything about how we work forever",
  },
  {
    id: "hypestack", name: "Hype Stack", family: "viral", tier: "pro",
    hint: "Words build up one by one until the line is full, then it clears. Keywords set off an emoji burst.",
    benchmark: "High-energy hype edits",
    type: { font: "Anton", weight: 400, case: "upper", size: 1.05 }, words: 4, motion: "stack",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#3BFF8F", outline: K, outlineWidth: 3 }, container: "none", emoji: "burst",
    sample: "Day one nobody believed:🔥 day ninety everybody asked how",
  },
  {
    id: "cashflow", name: "Cash Flow", family: "viral", tier: "creator",
    hint: "Heavy italic caps leaning forward. Numbers and money words glow green.",
    benchmark: "Finance and side-hustle creators",
    type: { font: "Montserrat", weight: 900, italic: true, case: "upper", size: 1 }, words: 2, motion: "glow",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#2BFF88", glow: "#18E07A", outline: K, outlineWidth: 2 }, container: "none", emoji: "above",
    sample: "We made 40K:💰 in thirty days:📈 with one product",
  },
  {
    id: "shockwave", name: "Shockwave", family: "viral", tier: "pro",
    hint: "Hard offset shadow. Emphasis words shake for a quarter second, like a hit landing.",
    benchmark: "The shake or earthquake styles",
    type: { font: "Rubik", weight: 900, case: "upper", size: 1 }, words: 2, motion: "shake",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF6A1F", outline: K, outlineWidth: 3, hardShadow: K }, container: "none", emoji: "end",
    sample: "He said WHAT:😱 to the investors in the room",
  },
  {
    id: "tilt", name: "Tilt", family: "viral", tier: "creator",
    hint: "The whole line sits at −4°. The spoken word flips to black on yellow, like a sticker slapped on.",
    benchmark: "TikTok sticker-text edits",
    type: { font: "Archivo Black", weight: 400, case: "upper", size: 1 }, words: 3, motion: "boxword",
    placement: { y: "mid", align: "center", tilt: -4 },
    colors: { base: W, accent: "#111111", box: "#FFE600", outline: K, outlineWidth: 3 }, container: "none", emoji: "none",
    sample: "Three things I wish I knew at twenty",
  },

  // ── Karaoke & Highlight ───────────────────────────────────────────────────
  {
    id: "karaoke", name: "Karaoke", family: "karaoke", tier: "free",
    hint: "The full phrase stays up; colour fills each word in time with speech. Easy to read along with.",
    benchmark: "The classic sing-along fill",
    type: { font: "Poppins", weight: 800, case: "none", size: 0.9 }, words: 5, motion: "karaoke",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#2EE6FF", outline: K, outlineWidth: 2 }, container: "none", emoji: "none",
    sample: "The secret is that nobody actually knows what they are doing",
  },
  {
    id: "spotlight", name: "Spotlight", family: "karaoke", tier: "free",
    hint: "Unspoken words sit at a third of full opacity. The spoken word is full white and lifts slightly.",
    benchmark: "The 'focus' and 'deep dive' styles",
    type: { font: "Montserrat", weight: 800, case: "none", size: 1 }, words: 4, motion: "dim",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: K, outlineWidth: 1.5 }, container: "none", emoji: "none",
    sample: "Most people quit right before it starts working",
  },
  {
    id: "neontrace", name: "Neon Trace", family: "karaoke", tier: "pro",
    hint: "Wide, rounded caps. The spoken word lights up with a magenta neon bloom.",
    benchmark: "Music and nightlife edits",
    type: { font: "Unbounded", weight: 700, case: "upper", size: 0.85 }, words: 3, motion: "glow",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, glow: "#FF3DF5", outline: "#2A0030", outlineWidth: 1.5 }, container: "none", emoji: "none",
    sample: "Turn it up we are going all night",
  },
  {
    id: "marker", name: "Marker", family: "karaoke", tier: "creator",
    hint: "A skewed yellow highlighter swipes behind the spoken word, left to right.",
    benchmark: "The highlighter-box styles",
    type: { font: "Poppins", weight: 800, case: "none", size: 1 }, words: 3, motion: "marker",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#111111", box: "#FFE14D", outline: K, outlineWidth: 2 }, container: "none", emoji: "none",
    sample: "Write this down because it matters",
  },
  {
    id: "underline", name: "Underline", family: "karaoke", tier: "free",
    hint: "An emerald bar sweeps under each spoken word. Calm enough for teaching.",
    benchmark: "Explainer and education channels",
    type: { font: "Space Grotesk", weight: 700, case: "none", size: 1 }, words: 4, motion: "underline",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: W, box: "#20D68A", outline: "#0000008C", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "Here is how compound interest really works",
  },
  {
    id: "hollow", name: "Hollow", family: "karaoke", tier: "pro",
    hint: "Outline-only letters. The spoken word fills solid white.",
    benchmark: "Fashion and sneaker edits",
    type: { font: "Anton", weight: 400, case: "upper", size: 1.2 }, words: 3, motion: "hollow",
    placement: { y: "mid", align: "center" },
    colors: { base: "#FFFFFF00", accent: W, outline: W, outlineWidth: 1.5 }, container: "none", emoji: "none",
    sample: "Limited drop only two hundred pairs",
  },
  {
    id: "splittone", name: "Split Tone", family: "karaoke", tier: "pro",
    hint: "The spoken word fills with a true yellow-to-orange gradient, top to bottom.",
    benchmark: "Sports highlight edits",
    type: { font: "Bebas Neue", weight: 400, case: "upper", size: 1.4 }, words: 2, motion: "split",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: K, outlineWidth: 2, gradient: { from: "#FFD60A", to: "#FF7A00", target: "active" } },
    container: "none", emoji: "none",
    sample: "Last second shot to win the title",
  },

  // ── Box & Pill ────────────────────────────────────────────────────────────
  {
    id: "pill", name: "Pill", family: "box", tier: "free",
    hint: "The whole line on a white rounded pill. The spoken word turns emerald. Native to the feed.",
    benchmark: "Instagram's built-in caption sticker",
    type: { font: "Poppins", weight: 700, case: "none", size: 0.85 }, words: 3, motion: "color",
    placement: { y: "low", align: "center" },
    colors: { base: "#111111", accent: "#00A968", box: W }, container: "pill", emoji: "none",
    sample: "Okay so here is what happened today",
  },
  {
    id: "bubbles", name: "Bubbles", family: "box", tier: "creator",
    hint: "Every word sits in its own pastel bubble. The spoken bubble pops.",
    benchmark: "Kids, family and cooking accounts",
    type: { font: "Fredoka", weight: 700, case: "none", size: 1 }, words: 2, motion: "bubble",
    placement: { y: "mid", align: "center" },
    colors: { base: "#1B1B1B", accent: "#1B1B1B", palette: ["#FFD6E8", "#C9F2FF", "#E2FFC9", "#FFF1B8"] }, container: "none", emoji: "end",
    sample: "Add the sugar:🍯 slowly and keep stirring",
  },
  {
    id: "ticker", name: "Ticker", family: "box", tier: "creator",
    hint: "A full-width black bar along the lower third. The spoken word turns yellow.",
    benchmark: "TV news lower-thirds",
    type: { font: "Barlow Condensed", weight: 700, case: "upper", size: 0.9 }, words: 5, motion: "color",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#FFD60A", box: K }, container: "bar", emoji: "none",
    sample: "Markets fall three percent after surprise announcement",
  },
  {
    id: "sticker", name: "Sticker", family: "box", tier: "pro",
    hint: "A black sticker with a white border, tilted a few degrees differently on every chunk.",
    benchmark: "Scrapbook and meme edits",
    type: { font: "Lilita One", weight: 400, case: "none", size: 1 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFE14D", box: "#111111" }, container: "sticker", emoji: "above",
    sample: "POV you finally:🎉 cleaned your room",
  },
  {
    id: "glass", name: "Glass", family: "box", tier: "creator",
    hint: "Frosted glass: the video behind the caption is blurred under a dark tint. Reads on busy footage and still looks premium.",
    benchmark: "Product and tech reviews",
    type: { font: "Manrope", weight: 700, case: "none", size: 0.85 }, words: 4, motion: "color",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#20D68A", box: "#0A100E80" }, container: "glass", emoji: "none",
    sample: "The battery easily lasts two full days",
  },
  {
    id: "blocks", name: "Blocks", family: "box", tier: "pro",
    hint: "One word per beat, each on its own solid colour block that slams in.",
    benchmark: "Bold single-word edits",
    type: { font: "Archivo Black", weight: 400, case: "upper", size: 1.35 }, words: 1, motion: "blocks",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, palette: ["#FF3B30", "#FF9500", "#34C759", "#0A84FF", "#AF52DE"] }, container: "none", emoji: "none",
    sample: "Build ship learn repeat every single day",
  },

  // ── Creator & Vlog ────────────────────────────────────────────────────────
  {
    id: "comic", name: "Comic", family: "creator", tier: "creator",
    hint: "Comic-book lettering with a hard drop shadow. Hit words get an emoji burst.",
    benchmark: "The comic-caption challenge look",
    type: { font: "Bangers", weight: 400, case: "upper", size: 1.2, tracking: 0.03 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center", tilt: -2 },
    colors: { base: W, accent: "#FFE600", outline: K, outlineWidth: 3, hardShadow: K }, container: "none", emoji: "burst",
    sample: "Then the whole thing EXPLODED:💥 on stage",
  },
  {
    id: "doodle", name: "Doodle", family: "creator", tier: "pro",
    hint: "Marker handwriting. Each spoken word wobbles in like it was just drawn.",
    benchmark: "Sketch comedy and storytime",
    type: { font: "Permanent Marker", weight: 400, case: "none", size: 1 }, words: 3, motion: "wobble",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8AD8", outline: K, outlineWidth: 2.5 }, container: "none", emoji: "end",
    sample: "My cat:🐱 literally judged me all morning",
  },
  {
    id: "diary", name: "Diary", family: "creator", tier: "creator",
    hint: "Handwriting that writes itself on, word by word. Soft shadow, no heavy outline.",
    benchmark: "Aesthetic vlogs and day-in-the-life",
    type: { font: "Caveat", weight: 700, case: "lower", size: 1.2 }, words: 4, motion: "type",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: W, outline: "#00000080", outlineWidth: 1 }, container: "none", emoji: "end",
    sample: "slow mornings and fresh coffee:☕ before work",
  },
  {
    id: "bubblegum", name: "Bubblegum", family: "creator", tier: "creator",
    hint: "Round, bouncy type with a pink outline. The spoken word bounces and turns bubblegum pink.",
    benchmark: "Beauty, GRWM and lifestyle",
    type: { font: "Baloo 2", weight: 800, case: "none", size: 1 }, words: 2, motion: "bounce",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF7AC2", outline: "#B0167A", outlineWidth: 3 }, container: "none", emoji: "above",
    sample: "This lip gloss:💋 is honestly so good",
  },
  {
    id: "pastel", name: "Pastel", family: "creator", tier: "pro",
    hint: "Lowercase, rounded and quiet. A lilac outline with a soft pop on each word.",
    benchmark: "Soft aesthetic and study accounts",
    type: { font: "Nunito", weight: 900, case: "lower", size: 1 }, words: 3, motion: "pops",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#D7C8FF", outline: "#6B4BFF", outlineWidth: 2.5 }, container: "none", emoji: "none",
    sample: "study with me for one hour",
  },
  {
    id: "story", name: "Story", family: "creator", tier: "free",
    hint: "Each line on its own white block, left aligned, fading in per line. Looks typed in-app.",
    benchmark: "The Instagram Stories text tool",
    type: { font: "Poppins", weight: 600, case: "none", size: 0.8 }, words: 6, motion: "fade",
    placement: { y: "mid", align: "left" },
    colors: { base: "#111111", accent: "#111111", box: W }, container: "line", emoji: "none",
    sample: "so I tried the viral pasta recipe and honestly it was fine",
  },
  {
    id: "emojirain", name: "Emoji Rain", family: "creator", tier: "pro",
    hint: "Keywords make emoji fall from the top of the frame behind the caption.",
    benchmark: "Celebration and reveal moments",
    type: { font: "Rubik", weight: 800, case: "none", size: 1 }, words: 3, motion: "color",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: K, outlineWidth: 2.5 }, container: "none", emoji: "rain",
    sample: "We hit one million:🎉 subscribers today:🥳",
  },

  // ── Podcast & Interview ───────────────────────────────────────────────────
  {
    id: "studio", name: "Studio", family: "podcast", tier: "free",
    hint: "Sits low and clear of faces. One yellow active word, no motion. Never distracts from the speaker.",
    benchmark: "The clean podcast-clip default",
    type: { font: "Montserrat", weight: 700, case: "none", size: 0.9 }, words: 4, motion: "color",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: "#000000B3", outlineWidth: 1.5 }, container: "none", emoji: "none",
    sample: "The best advice I ever got was really simple",
  },
  {
    id: "twomic", name: "Two Mic", family: "podcast", tier: "creator",
    hint: "Each speaker gets their own text colour, so viewers can follow who is talking. Single colour when the transcript has no speaker labels.",
    benchmark: "Two-person interview clips",
    type: { font: "Poppins", weight: 700, case: "none", size: 0.9 }, words: 4, motion: "color",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: "#000000B3", outlineWidth: 1.5, speakers: [W, "#8FE9FF", "#FFB86B", "#C6A8FF"] },
    container: "none", emoji: "none", extra: "speakers",
    sample: "So why did you leave Google honestly the money was not enough",
  },
  {
    id: "quote", name: "Quote", family: "podcast", tier: "pro",
    hint: "A large gold quotation mark and serif type for the one line worth sharing. Emphasis words go gold italic.",
    benchmark: "Pull-quote and audiogram cards",
    type: { font: "DM Serif Display", weight: 400, case: "none", size: 0.9 }, words: 6, motion: "emph",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#E8C26B", outline: "#00000099", outlineWidth: 1 }, container: "none", emoji: "none", extra: "quote",
    sample: "Your *network is your net worth and I *mean that",
  },
  {
    id: "waveform", name: "Waveform", family: "podcast", tier: "creator",
    hint: "Small live audio bars next to the caption, driven by the speech loudness we already measure for every clip.",
    benchmark: "Audiograms",
    type: { font: "Space Grotesk", weight: 700, case: "none", size: 0.85 }, words: 4, motion: "color",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#20D68A", box: "#0A100E80", box2: "#20D68A" }, container: "glass", emoji: "none", extra: "bars",
    sample: "We talk about burnout way too late",
  },
  {
    id: "lowerthird", name: "Lower Third", family: "podcast", tier: "pro",
    hint: "A dark panel with an emerald edge, left aligned. The spoken word shifts to bold; nothing moves.",
    benchmark: "Broadcast interviews",
    type: { font: "Barlow", weight: 700, case: "none", size: 0.85 }, words: 5, motion: "bold",
    placement: { y: "low", align: "left" },
    colors: { base: W, accent: W, box: "#050908CC", box2: "#20D68A" }, container: "dark", emoji: "none",
    sample: "Regulation will reshape the industry by next year",
  },

  // ── Minimal & Pro ─────────────────────────────────────────────────────────
  {
    id: "clean", name: "Clean", family: "minimal", tier: "free",
    hint: "Readable on anything, almost no motion. The default for new users.",
    benchmark: "The safe default in every tool",
    type: { font: "Inter", weight: 700, case: "none", size: 0.9 }, words: 4, motion: "pops",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: W, outline: K, outlineWidth: 1.5 }, container: "none", emoji: "none",
    sample: "Here is what you need to know first",
  },
  {
    id: "lowkey", name: "Lowkey", family: "minimal", tier: "free",
    hint: "Small lowercase, shadow only. The spoken word just turns bold.",
    benchmark: "Understated creator captions",
    type: { font: "Inter", weight: 500, case: "lower", size: 0.75 }, words: 5, motion: "bold",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: W, outline: "#0000008C", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "honestly this is the only routine that stuck",
  },
  {
    id: "keynote", name: "Keynote", family: "minimal", tier: "creator",
    hint: "Each word rises a few pixels into place. No colour change, no outline. Feels like a launch event.",
    benchmark: "Product launch and keynote clips",
    type: { font: "Plus Jakarta Sans", weight: 700, case: "none", size: 1 }, words: 3, motion: "rise",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: "#00000080", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "Introducing the fastest version we have ever built",
  },
  {
    id: "swiss", name: "Swiss", family: "minimal", tier: "pro",
    hint: "Hard cuts, tight tracking, left aligned with a red square. Poster typography, zero animation.",
    benchmark: "Design studios and agencies",
    type: { font: "Inter Tight", weight: 800, case: "none", size: 1.05, tracking: -0.02 }, words: 3, motion: "cut",
    placement: { y: "high", align: "left" },
    colors: { base: W, accent: W, outline: "#00000073", outlineWidth: 1, box: "#FF3B30" }, container: "none", emoji: "none", extra: "square",
    sample: "Less but better every single time",
  },
  {
    id: "whisper", name: "Whisper", family: "minimal", tier: "creator",
    hint: "Each word resolves out of a blur. Quiet and a little cinematic.",
    benchmark: "The blur-switch styles",
    type: { font: "DM Sans", weight: 500, case: "none", size: 1 }, words: 3, motion: "blur",
    placement: { y: "low", align: "center" },
    colors: { base: "#FFFFFFF0", accent: W, outline: "#00000066", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "and that is when everything went quiet",
  },
  {
    id: "thin", name: "Thin", family: "minimal", tier: "pro",
    hint: "Light weight at a large size, two words at a time, slow fades. Luxury by restraint.",
    benchmark: "Fashion and interior edits",
    type: { font: "Outfit", weight: 300, case: "lower", size: 1.3 }, words: 2, motion: "fade",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: "#00000066", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "soft light warm wood quiet rooms",
  },

  // ── Cinematic & Editorial ─────────────────────────────────────────────────
  {
    id: "cinema", name: "Cinema", family: "cinema", tier: "creator",
    hint: "Letterbox bars and warm serif subtitles that fade line by line. Makes any clip feel shot on film.",
    benchmark: "Film subtitles",
    type: { font: "Cormorant Garamond", weight: 600, case: "none", size: 0.9, tracking: 0.02 }, words: 6, motion: "fade",
    placement: { y: "low", align: "center" },
    colors: { base: "#F4EBD0", accent: "#F4EBD0", outline: "#00000099", outlineWidth: 1 }, container: "none", emoji: "none", extra: "letterbox",
    sample: "I never told anyone what really happened that night",
  },
  {
    id: "trailer", name: "Trailer", family: "cinema", tier: "pro",
    hint: "Wide-tracked gold capitals that drift in from a blur, two words at a time.",
    benchmark: "Movie trailers",
    type: { font: "Cinzel", weight: 700, case: "upper", size: 0.85, tracking: 0.14 }, words: 2, motion: "zoom",
    placement: { y: "mid", align: "center" },
    colors: { base: "#E8C26B", accent: "#E8C26B", outline: "#00000099", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "This summer one choice changes everything",
  },
  {
    id: "documentary", name: "Documentary", family: "cinema", tier: "creator",
    hint: "Classic serif. Emphasis words turn gold italic; everything else stays still.",
    benchmark: "Documentary and luxury brand edits",
    type: { font: "Playfair Display", weight: 700, case: "none", size: 0.9 }, words: 4, motion: "emph",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#E8C26B", outline: "#00000099", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "Every piece is *hand finished over *forty hours",
  },
  {
    id: "noir", name: "Noir", family: "cinema", tier: "pro",
    hint: "One huge word at a time on a black slab, flickering in like a failing bulb.",
    benchmark: "Thriller and true-crime edits",
    type: { font: "Syne", weight: 800, case: "upper", size: 1.4 }, words: 1, motion: "flicker",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, box: K }, container: "wordbox", emoji: "none",
    sample: "She was never seen again after midnight",
  },
  {
    id: "magazine", name: "Magazine", family: "cinema", tier: "pro",
    hint: "Bold sans, but the spoken word switches to a large serif italic in coral. Reads like a magazine cover.",
    benchmark: "Editorial fashion and culture",
    type: { font: "Inter", weight: 800, case: "none", size: 1 }, words: 3, motion: "fontswitch",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFB8A0", outline: "#0000008C", outlineWidth: 1 }, container: "none", emoji: "none",
    sample: "The quiet luxury era is officially over",
  },

  // ── Gaming & Retro ────────────────────────────────────────────────────────
  {
    id: "arcade", name: "Arcade", family: "retro", tier: "pro",
    hint: "Pixel font, three-frame stepped animation with no easing, like an 8-bit menu.",
    benchmark: "Retro gaming channels",
    type: { font: "Press Start 2P", weight: 400, case: "upper", size: 0.6 }, words: 2, motion: "step",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#3BFF8F", outline: K, outlineWidth: 2.5 }, container: "none", emoji: "end",
    sample: "Final boss:👾 one life left",
  },
  {
    id: "glitch", name: "Glitch", family: "retro", tier: "pro",
    hint: "Red and cyan channel split that jitters on each spoken word.",
    benchmark: "The glitch styles",
    type: { font: "Rubik", weight: 800, case: "upper", size: 1.1 }, words: 2, motion: "rgb",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W }, container: "none", emoji: "none",
    sample: "System failure reboot in three seconds",
  },
  {
    id: "synthwave", name: "Synthwave", family: "retro", tier: "pro",
    hint: "Retro rounded type. The spoken word fills with a pink-to-purple gradient and glows.",
    benchmark: "Synth, lo-fi and night-drive edits",
    type: { font: "Righteous", weight: 400, case: "none", size: 1 }, words: 3, motion: "glow",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD1F3", glow: "#B44BFF", outline: "#2A0050", outlineWidth: 1.5, gradient: { from: "#FFD1F3", to: "#B44BFF", target: "active" } },
    container: "none", emoji: "none",
    sample: "Driving through the city at three AM",
  },
  {
    id: "terminal", name: "Terminal", family: "retro", tier: "creator",
    hint: "Green phosphor text typed out character by character, with a blinking block cursor.",
    benchmark: "Developer and tech creators",
    type: { font: "VT323", weight: 400, case: "lower", size: 1.25 }, words: 5, motion: "typestep",
    placement: { y: "mid", align: "left" },
    colors: { base: "#33FF66", accent: "#33FF66", outline: "#000000B3", outlineWidth: 1 }, container: "none", emoji: "none", extra: "cursor",
    sample: "deploying to production on a friday night",
  },

  // ── Hindi & Hinglish ──────────────────────────────────────────────────────
  {
    id: "dhamaka", name: "Dhamaka", family: "desi", tier: "creator",
    hint: "Heavy Devanagari with a saffron active word and emoji pops, sized for Hindi's taller letters.",
    benchmark: "Hindi motivation and finance reels",
    type: { font: "Mukta", weight: 800, case: "none", size: 1.15 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF9933", outline: K, outlineWidth: 3 }, container: "none", emoji: "above", script: "devanagari",
    sample: "ये ट्रिक:🔥 किसी को नहीं पता",
  },
  {
    id: "filmi", name: "Filmi", family: "desi", tier: "pro",
    hint: "High-contrast Devanagari display type in a gold gradient, slamming in like a film title.",
    benchmark: "Bollywood title cards",
    type: { font: "Rozha One", weight: 400, case: "none", size: 1.25 }, words: 2, motion: "slam",
    placement: { y: "mid", align: "center" },
    colors: { base: "#FFD27A", accent: W, outline: "#5A1A00", outlineWidth: 3, gradient: { from: "#FFE7A3", to: "#D99A2B", target: "all" } },
    container: "none", emoji: "none", script: "devanagari",
    sample: "हिम्मत रखो सपने बड़े",
  },

  // ── Gradient Pop ───────────────────────────────────────────────────────────
  {
    id: "sunset", name: "Sunset", family: "gradient", tier: "free",
    hint: "The spoken word fills with a warm yellow-to-red gradient and pops; an emoji lands above the keyword.",
    benchmark: "Gradient-text hooks on Reels",
    type: { font: "Montserrat", weight: 900, case: "upper", size: 1 }, words: 3, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8A3D", outline: K, outlineWidth: 3, gradient: { from: "#FFD23F", to: "#FF4E50", target: "active" } },
    container: "none", emoji: "above",
    sample: "Watch this:👀 before you quit your job:💼",
  },
  {
    id: "limesoda", name: "Lime Soda", family: "gradient", tier: "free",
    hint: "Lime-to-emerald fill that beats twice on every spoken word. Fizzy, bright and on brand.",
    benchmark: "Life-hack and productivity shorts",
    type: { font: "Dela Gothic One", weight: 400, case: "upper", size: 1 }, words: 2, motion: "heartbeat",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#B8FF3B", outline: K, outlineWidth: 3, gradient: { from: "#E6FF5C", to: "#20D68A", target: "active" } },
    container: "none", emoji: "end",
    sample: "This hack:🍋 saves you two hours",
  },
  {
    id: "molten", name: "Molten", family: "gradient", tier: "pro",
    hint: "Lava-coloured block caps; each word punches in out of a blur and keywords throw a fire burst.",
    benchmark: "Sale and deal announcements",
    type: { font: "Bungee", weight: 400, case: "upper", size: 1 }, words: 2, motion: "punch",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFE259", outline: "#2A0A00", outlineWidth: 3, gradient: { from: "#FFE259", to: "#FF5F1F", target: "all" } },
    container: "none", emoji: "burst",
    sample: "Hottest:🔥 deal of the whole year",
  },
  {
    id: "oceandrop", name: "Ocean Drop", family: "gradient", tier: "creator",
    hint: "The spoken word drops in and squashes on landing, filled aqua-to-deep-blue like water.",
    benchmark: "Travel and swim content",
    type: { font: "Sora", weight: 800, case: "none", size: 1 }, words: 3, motion: "drop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#7CF8FF", outline: "#001833", outlineWidth: 2, gradient: { from: "#7CF8FF", to: "#1F7BFF", target: "active" } },
    container: "none", emoji: "end",
    sample: "Swim:🌊 before sunrise every single day",
  },
  {
    id: "peachfizz", name: "Peach Fizz", family: "gradient", tier: "pro",
    hint: "Peach-to-coral fill that squashes flat, stretches tall and snaps back like a squeezed fruit.",
    benchmark: "Summer drinks and recipe reels",
    type: { font: "Baloo 2", weight: 800, case: "none", size: 1 }, words: 2, motion: "elastic",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFB199", outline: "#5A1426", outlineWidth: 3, gradient: { from: "#FFD1A9", to: "#FF7A90", target: "active" } },
    container: "none", emoji: "above",
    sample: "Summer:🌞 drinks that actually taste good:🍹",
  },

  {
    id: "aurora", name: "Aurora", family: "gradient", tier: "creator",
    hint: "A light band sweeps across the mint spoken word while the whole caption floats; tiny sparkles twinkle round it.",
    benchmark: "Skincare and wellness creators",
    type: { font: "Lexend", weight: 800, case: "none", size: 1 }, words: 3, motion: "shimmer",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#5CFFB0", outline: "#04130C", outlineWidth: 2, cycle: ["#5CFFB0", "#B8A6FF"] },
    container: "none", emoji: "none", symbols: { mode: "sparkle", glyphs: "✦", colors: ["#B8FF3B", "#5CFFB0", "#4CC9FF"] }, loop: "float",
    sample: "Your skin will thank you for this one",
  },
  {
    id: "candy", name: "Candy", family: "gradient", tier: "creator",
    hint: "Every word is pink-to-violet candy; the spoken word brightens at the top and pops.",
    benchmark: "Food and dessert accounts",
    type: { font: "Titan One", weight: 400, case: "none", size: 1 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8AD8", outline: "#2A0A3A", outlineWidth: 3, gradient: { from: "#FF8AD8", to: "#8A7CFF", target: "all" } },
    container: "none", emoji: "end",
    sample: "Pink pancakes:🥞 for breakfast:🍓 today",
  },
  {
    id: "emeraldedge", name: "Emerald Edge", family: "gradient", tier: "pro",
    hint: "Our emerald, extruded into a 3D block on the spoken word, with a rising triangle before each line.",
    benchmark: "Clipiro's own brand look, for growth and finance clips",
    type: { font: "Barlow Condensed", weight: 700, case: "upper", size: 1.2 }, words: 3, motion: "extrude",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#7CFFCB", outline: K, outlineWidth: 2, extrude: "#00573A", cycle: ["#7CFFCB", "#FFD60A"] },
    container: "none", emoji: "none", symbols: { mode: "prefix", glyphs: "▲", colors: ["#20D68A"] },
    sample: "Revenue up forty percent this quarter",
  },
  {
    id: "ultraviolet", name: "Ultraviolet", family: "gradient", tier: "pro",
    hint: "Wide caps in a violet gradient with a slow breathing glow around the whole line.",
    benchmark: "Electronic music and DJ clips",
    type: { font: "Unbounded", weight: 700, case: "upper", size: 0.9 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#C77DFF", outline: "#1A0033", outlineWidth: 2, glow: "#C77DFF", gradient: { from: "#E0AAFF", to: "#7B2CBF", target: "active" } },
    container: "none", emoji: "none", symbols: { mode: "sparkle", glyphs: "✧", colors: ["#E0AAFF", "#FFFFFF"] }, loop: "breathe",
    sample: "Drop the beat at exactly midnight",
  },
  {
    id: "goldrush", name: "Gold Rush", family: "gradient", tier: "pro",
    hint: "A fat serif in gold with a light sweep running across it, like a trophy plate.",
    benchmark: "Wealth, luxury and milestone posts",
    type: { font: "Abril Fatface", weight: 400, case: "none", size: 1.1 }, words: 2, motion: "shimmer",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFC83D", outline: "#3A2600", outlineWidth: 2, cycle: ["#FFC83D", "#FFF4C2"] },
    container: "none", emoji: "above",
    sample: "First:🥇 million by twenty five:💰",
  },

  // ── Colour Switch ─────────────────────────────────────────────────────────
  {
    id: "duotone", name: "Duotone", family: "chroma", tier: "creator",
    hint: "Spoken words alternate pink and cyan and tilt left, then right, like two sides arguing.",
    benchmark: "This-or-that and debate clips",
    type: { font: "Anton", weight: 400, case: "upper", size: 1.15 }, words: 2, motion: "tiltswap",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF3D9A", outline: K, outlineWidth: 3, cycle: ["#FF3D9A", "#00E5FF"] },
    container: "none", emoji: "above",
    sample: "Left:👈 or right:👉 choose right now",
  },
  {
    id: "tuttifrutti", name: "Tutti Frutti", family: "chroma", tier: "free",
    hint: "Fruit colours, one per word, and the spoken word wobbles like jelly.",
    benchmark: "Kids, food and family accounts",
    type: { font: "Chewy", weight: 400, case: "none", size: 1.1 }, words: 2, motion: "jelly",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF6B6B", outline: "#1B1B1B", outlineWidth: 3, wordColors: ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF"] },
    container: "none", emoji: "above",
    sample: "Fruit:🍉 salad in thirty seconds flat",
  },
  {
    id: "popart", name: "Pop Art", family: "chroma", tier: "pro",
    hint: "Primary red, yellow and blue stamped on one word after another, with a hard shadow and a hit burst.",
    benchmark: "Comic-style product drops",
    type: { font: "Bowlby One", weight: 400, case: "upper", size: 1 }, words: 2, motion: "stamp",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF2D55", outline: K, outlineWidth: 2, hardShadow: K, cycle: ["#FF2D55", "#FFD60A", "#0A84FF"] },
    container: "none", emoji: "burst",
    sample: "BAM:💥 the price just dropped",
  },
  {
    id: "pillparade", name: "Pill Parade", family: "chroma", tier: "free",
    hint: "The spoken word sits in a rounded chip, and the chip changes colour on every word.",
    benchmark: "The coloured chip captions CapCut made the default",
    type: { font: "Lexend", weight: 800, case: "none", size: 1 }, words: 3, motion: "boxword",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: K, outlineWidth: 2, box: "#FF3B30", boxCycle: ["#FF3B30", "#0A84FF", "#34C759", "#FF9F0A", "#BF5AF2"] },
    container: "none", wordBox: "pill", emoji: "end",
    sample: "New update:🚀 dropped here is everything",
  },
  {
    id: "highlighterpack", name: "Highlighter Pack", family: "chroma", tier: "creator",
    hint: "A highlighter swipes behind each spoken word, and the pen changes colour every word: yellow, mint, pink, blue.",
    benchmark: "Study and note-taking accounts",
    type: { font: "Plus Jakarta Sans", weight: 700, case: "none", size: 1 }, words: 3, motion: "marker",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#111111", outline: K, outlineWidth: 2, box: "#FFE14D", boxCycle: ["#FFE14D", "#7CFFCB", "#FF9AD5", "#9AD0FF"] },
    container: "none", emoji: "end",
    sample: "Three study tips:📝 that actually work",
  },
  {
    id: "confettiwords", name: "Confetti Words", family: "chroma", tier: "pro",
    hint: "Each word keeps its own bright colour; emphasised words fire a burst of coloured confetti.",
    benchmark: "Party, launch and announcement clips",
    type: { font: "Luckiest Guy", weight: 400, case: "upper", size: 1 }, words: 3, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF4D6D", outline: K, outlineWidth: 3, wordColors: ["#FF4D6D", "#FFD23F", "#3BFF8F", "#4CC9FF", "#B388FF"] },
    container: "none", emoji: "none", symbols: { mode: "confetti", glyphs: "✦●▲■", colors: ["#FF4D6D", "#FFD23F", "#3BFF8F", "#4CC9FF", "#B388FF"] },
    sample: "*Party starts *right *now everybody",
  },
  {
    id: "trafficlight", name: "Traffic Light", family: "chroma", tier: "creator",
    hint: "One huge word at a time, flashing white and settling into red, amber, then green.",
    benchmark: "One-word-per-beat edits",
    type: { font: "Archivo Black", weight: 400, case: "upper", size: 1.5 }, words: 1, motion: "flash",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF3B30", outline: K, outlineWidth: 3, cycle: ["#FF3B30", "#FFCC00", "#34C759"] },
    container: "none", emoji: "none", symbols: { mode: "flank", glyphs: "●", colors: ["#FF3B30"] },
    sample: "Stop think then go right now",
  },
  {
    id: "prism", name: "Prism", family: "chroma", tier: "pro",
    hint: "Every letter of the spoken word takes its own colour and hops in a wave.",
    benchmark: "Pride, celebration and colour-pop content",
    type: { font: "Rubik", weight: 900, case: "upper", size: 1 }, words: 2, motion: "rainbow",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: K, outlineWidth: 3, letterColors: ["#FF5A5F", "#FFB400", "#3BFF8F", "#00C2FF", "#9B5CFF"] },
    container: "none", emoji: "end",
    sample: "Pride:🌈 month starts today everyone",
  },
  {
    id: "splitpersonality", name: "Split Personality", family: "chroma", tier: "pro",
    hint: "The spoken word is cyan on top, pink below, with crosses either side of the line.",
    benchmark: "Expectation-versus-reality memes",
    type: { font: "Oswald", weight: 700, case: "upper", size: 1.25 }, words: 2, motion: "split",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#00E5FF", outline: K, outlineWidth: 2, gradient: { from: "#00E5FF", to: "#FF3D9A", target: "active" } },
    container: "none", emoji: "none", symbols: { mode: "flank", glyphs: "✕", colors: ["#FF3D9A"] },
    sample: "Expectation versus reality every time",
  },
  {
    id: "moodring", name: "Mood Ring", family: "chroma", tier: "creator",
    hint: "Rounded type whose colours slowly drift through the spectrum, like a mood ring.",
    benchmark: "Cozy vlogs and mood check-ins",
    type: { font: "Sniglet", weight: 800, case: "none", size: 1 }, words: 3, motion: "pops",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8AD8", outline: "#2B0040", outlineWidth: 2.5, cycle: ["#FF8AD8", "#9AD0FF"] },
    container: "none", emoji: "end", loop: "hue",
    sample: "Current mood:💜 cozy and unbothered",
  },

  // ── Sticker & Badge ───────────────────────────────────────────────────
  {
    id: "slapsticker", name: "Slap Sticker", family: "sticker", tier: "pro",
    hint: "Hot-pink sticker caption; the spoken word spins in and a big emoji sticker slaps onto the corner.",
    benchmark: "Meme and reaction pages",
    type: { font: "Titan One", weight: 400, case: "none", size: 1 }, words: 2, motion: "spin",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFE14D", box: "#FF3D9A", cycle: ["#FFE14D", "#7CF8FF"] },
    container: "sticker", emoji: "sticker",
    sample: "OMG:😱 you have to see this",
  },
  {
    id: "badgedrop", name: "Badge Drop", family: "sticker", tier: "free",
    hint: "A clean caption with an emerald NEW badge that pops into the corner on every line.",
    benchmark: "Feature announcements and launches",
    type: { font: "Montserrat", weight: 800, case: "none", size: 1 }, words: 3, motion: "color",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#20D68A", outline: K, outlineWidth: 2, cycle: ["#20D68A", "#B8FF3B"] },
    container: "none", emoji: "none", symbols: { mode: "badge", glyphs: "NEW ✦", colors: ["#00A968"] },
    sample: "Brand new feature just landed today",
  },
  {
    id: "breaking", name: "Breaking", family: "sticker", tier: "creator",
    hint: "A red news bar with a LIVE badge; each word slides in from the left like a ticker.",
    benchmark: "News commentary and live updates",
    type: { font: "Barlow Condensed", weight: 700, case: "upper", size: 0.95 }, words: 4, motion: "slidel",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#FFE14D", box: "#C8102E", cycle: ["#FFE14D", "#FF9F0A"] },
    container: "bar", emoji: "none", symbols: { mode: "badge", glyphs: "● LIVE", colors: ["#C8102E"] },
    sample: "Breaking news the launch date is confirmed",
  },
  {
    id: "pricetag", name: "Price Tag", family: "sticker", tier: "creator",
    hint: "The price word gets stamped on in red, and a tag sticker slaps on the corner.",
    benchmark: "Shopping hauls and deal finds",
    type: { font: "Archivo Black", weight: 400, case: "upper", size: 1 }, words: 2, motion: "stamp",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF2D55", outline: K, outlineWidth: 2, cycle: ["#FF2D55", "#FFD60A"] },
    container: "none", emoji: "sticker",
    sample: "Only ninety nine:🏷️ rupees today",
  },
  {
    id: "reviewstars", name: "Review Stars", family: "sticker", tier: "creator",
    hint: "A five-star row under the caption fills up one star per spoken word.",
    benchmark: "Product reviews and recommendations",
    type: { font: "Poppins", weight: 700, case: "none", size: 1 }, words: 3, motion: "pops",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFC83D", outline: K, outlineWidth: 2, cycle: ["#FFC83D", "#FF8A3D"] },
    container: "none", emoji: "none", symbols: { mode: "stars", glyphs: "★", colors: ["#FFC83D"] },
    sample: "Honestly the best headphones I have owned",
  },
  {
    id: "pinit", name: "Pin It", family: "sticker", tier: "creator",
    hint: "Handwriting on a yellow sticky note; the red spoken word drops onto the page.",
    benchmark: "Reminders and life-advice posts",
    type: { font: "Kalam", weight: 700, case: "none", size: 1.05 }, words: 3, motion: "drop",
    placement: { y: "mid", align: "center" },
    colors: { base: "#2B2100", accent: "#E5484D", box: "#FFF3B0", cycle: ["#E5484D", "#2E6BFF"] },
    container: "sticker", emoji: "end",
    sample: "Note to self:📌 drink more water",
  },
  {
    id: "speechbubble", name: "Speech Bubble", family: "sticker", tier: "free",
    hint: "A white speech pill; the spoken word turns pink and speech emoji flank the keyword.",
    benchmark: "Storytime and gossip clips",
    type: { font: "Fredoka", weight: 700, case: "none", size: 0.9 }, words: 3, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: "#111111", accent: "#FF3D9A", box: "#FFFFFF", cycle: ["#FF3D9A", "#7B5CFF"] },
    container: "pill", emoji: "flank",
    sample: "Wait:💬 did she really say that",
  },
  {
    id: "tapelabel", name: "Tape Label", family: "sticker", tier: "creator",
    hint: "Each word printed on a strip of yellow tape, swiping up into place, the line slightly crooked.",
    benchmark: "Warnings, DIY and hot takes",
    type: { font: "Space Grotesk", weight: 700, case: "upper", size: 1 }, words: 2, motion: "swipe",
    placement: { y: "mid", align: "center", tilt: -3 },
    colors: { base: "#111111", accent: "#111111", box: "#FFD60A", boxCycle: ["#FFD60A", "#FF8AD8"] },
    container: "wordbox", emoji: "end",
    sample: "Warning:⚠️ do not try this at home",
  },
  {
    id: "award", name: "Award", family: "sticker", tier: "pro",
    hint: "Engraved gold capitals stamped on like a seal, with gold sparkles and a trophy above.",
    benchmark: "Wins, results and testimonials",
    type: { font: "Cinzel", weight: 700, case: "upper", size: 0.85, tracking: 0.08 }, words: 2, motion: "stamp",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFC83D", outline: "#2A1C00", outlineWidth: 2, cycle: ["#FFC83D", "#E5E4E2"] },
    container: "none", emoji: "above", symbols: { mode: "sparkle", glyphs: "✦", colors: ["#FFC83D", "#FFFFFF"] },
    sample: "Winner:🏆 of the creator awards",
  },
  {
    id: "hashtag", name: "Hashtag", family: "sticker", tier: "free",
    hint: "Every line starts with an emerald hashtag, and each word rolls up like a slot.",
    benchmark: "Trend-jacking and topic intros",
    type: { font: "Inter Tight", weight: 800, case: "none", size: 1 }, words: 2, motion: "roll",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#20D68A", outline: K, outlineWidth: 2, cycle: ["#20D68A", "#4CC9FF"] },
    container: "none", emoji: "none", symbols: { mode: "prefix", glyphs: "#", colors: ["#20D68A"] },
    sample: "Trending now on every feed today",
  },

  // ── Kinetic 3D ────────────────────────────────────────────────────────
  {
    id: "flipboard", name: "Flipboard", family: "kinetic", tier: "pro",
    hint: "Each word sits on a black tile and flips over in 3D, turning yellow, like a departures board.",
    benchmark: "Airport split-flap boards",
    type: { font: "Bebas Neue", weight: 400, case: "upper", size: 1.3 }, words: 2, motion: "flip",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", box: "#111111", cycle: ["#FFD60A", "#FF8A00"] },
    container: "wordbox", emoji: "none", symbols: { mode: "badge", glyphs: "✈ DEPARTURES", colors: ["#C98A00"] }, entry: "drop",
    sample: "Gate twelve now boarding final call",
  },
  {
    id: "spincycle", name: "Spin Cycle", family: "kinetic", tier: "creator",
    hint: "The spoken word spins in from a full turn, in cyan, with a spiral emoji.",
    benchmark: "Mind-blown and plot-twist moments",
    type: { font: "Rubik", weight: 900, case: "upper", size: 1 }, words: 2, motion: "spin",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#00E5FF", outline: K, outlineWidth: 3, cycle: ["#00E5FF", "#FF3DF5"] },
    container: "none", emoji: "end",
    sample: "Mind:🌀 completely blown right now",
  },
  {
    id: "gravity", name: "Gravity", family: "kinetic", tier: "pro",
    hint: "Words fall from the top, squash on landing and bounce; keywords explode.",
    benchmark: "Fails, falls and big reveals",
    type: { font: "Anton", weight: 400, case: "upper", size: 1.15 }, words: 2, motion: "drop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8A00", outline: K, outlineWidth: 3, cycle: ["#FF8A00", "#FFD60A"] },
    container: "none", emoji: "burst",
    sample: "Then everything:💥 came crashing down",
  },
  {
    id: "pendulum", name: "Pendulum", family: "kinetic", tier: "creator",
    hint: "The spoken word hangs from its top edge and swings to rest, in lilac.",
    benchmark: "Deadlines and countdown content",
    type: { font: "Montserrat", weight: 900, case: "upper", size: 1 }, words: 2, motion: "swing",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#B388FF", outline: K, outlineWidth: 3, cycle: ["#B388FF", "#7CF8FF"] },
    container: "none", emoji: "above",
    sample: "Time:⏰ is running out for this",
  },
  {
    id: "rubberband", name: "Rubber Band", family: "kinetic", tier: "creator",
    hint: "Words squash flat, stretch tall and snap back, in fresh green.",
    benchmark: "Fitness and stretching routines",
    type: { font: "Luckiest Guy", weight: 400, case: "upper", size: 1 }, words: 2, motion: "elastic",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#7CFF6B", outline: K, outlineWidth: 3, cycle: ["#7CFF6B", "#FFE14D"] },
    container: "none", emoji: "end",
    sample: "Stretch:🤸 every morning for ten minutes",
  },
  {
    id: "block3d", name: "3D Block", family: "kinetic", tier: "pro",
    hint: "One word at a time, extruded into a yellow-and-orange 3D block that sways gently.",
    benchmark: "Motivational single-word edits",
    type: { font: "Rubik Mono One", weight: 400, case: "upper", size: 1.05 }, words: 1, motion: "extrude",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: K, outlineWidth: 2, extrude: "#FF3D00", cycle: ["#FFD60A", "#7CF8FF"] },
    container: "none", emoji: "above", loop: "sway",
    sample: "Build:🧱 bigger every single day",
  },
  {
    id: "jellybean", name: "Jelly Bean", family: "kinetic", tier: "creator",
    hint: "The spoken word wobbles side to side like jelly, in soft cyan.",
    benchmark: "Dessert and satisfying-video accounts",
    type: { font: "Baloo 2", weight: 800, case: "none", size: 1 }, words: 2, motion: "jelly",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#5CE1E6", outline: "#06334A", outlineWidth: 3, cycle: ["#5CE1E6", "#FF8AD8"] },
    container: "none", emoji: "above",
    sample: "Wiggle:🍮 dessert is finally ready",
  },
  {
    id: "heartbeat", name: "Heartbeat", family: "kinetic", tier: "creator",
    hint: "Love words beat twice like a heart, in red, with hearts either side.",
    benchmark: "Couples, pets and wholesome moments",
    type: { font: "Poppins", weight: 800, case: "none", size: 1 }, words: 2, motion: "heartbeat",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF2D55", outline: K, outlineWidth: 2, cycle: ["#FF2D55", "#FF8AD8"] },
    container: "none", emoji: "flank",
    sample: "I love:❤️ this little moment",
  },
  {
    id: "punchin", name: "Punch In", family: "kinetic", tier: "pro",
    hint: "Single words punch out of a blur at the camera, in red; each chunk swirls in.",
    benchmark: "Fast-cut hype edits",
    type: { font: "Archivo Black", weight: 400, case: "upper", size: 1.5 }, words: 1, motion: "punch",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF2D55", outline: K, outlineWidth: 3, cycle: ["#FF2D55", "#FFD60A"] },
    container: "none", emoji: "none", symbols: { mode: "flank", glyphs: "⚡", colors: ["#FFD60A"] }, entry: "swirl",
    sample: "Hit hard hit fast hit again",
  },
  {
    id: "slotmachine", name: "Slot Machine", family: "kinetic", tier: "pro",
    hint: "Words roll up like slot reels and dollar signs twinkle round the jackpot word.",
    benchmark: "Money stories and giveaways",
    type: { font: "Bungee", weight: 400, case: "upper", size: 1 }, words: 2, motion: "roll",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: K, outlineWidth: 3, cycle: ["#FFD60A", "#3BFF8F"] },
    container: "none", emoji: "end", symbols: { mode: "sparkle", glyphs: "$", colors: ["#3BFF8F", "#FFD60A"] },
    sample: "Jackpot:🎰 ten thousand in one night",
  },

  // ── Letter FX ─────────────────────────────────────────────────────────
  {
    id: "wave", name: "Wave", family: "letters", tier: "creator",
    hint: "The letters of the spoken word ripple up and down like a wave.",
    benchmark: "Beach, surf and summer vlogs",
    type: { font: "Fredoka", weight: 700, case: "none", size: 1.1 }, words: 2, motion: "wave",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#4CC9FF", outline: "#002B40", outlineWidth: 3, cycle: ["#4CC9FF", "#7CFFCB"] },
    container: "none", emoji: "end",
    sample: "Ride:🏄 the wave all summer long",
  },
  {
    id: "cascade", name: "Cascade", family: "letters", tier: "free",
    hint: "Letters tumble in one after another and land in place, with a yellow sparkle.",
    benchmark: "Title reveals and intros",
    type: { font: "Montserrat", weight: 900, case: "upper", size: 1 }, words: 2, motion: "cascade",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFE14D", outline: K, outlineWidth: 3, cycle: ["#FFE14D", "#FF8A3D"] },
    container: "none", emoji: "none", symbols: { mode: "sparkle", glyphs: "✦", colors: ["#FFE14D"] },
    sample: "Every letter falls into place",
  },
  {
    id: "decoder", name: "Decoder", family: "letters", tier: "pro",
    hint: "Each word scrambles through random characters before it decodes, behind a prompt mark.",
    benchmark: "Hacker, crypto and reveal content",
    type: { font: "Major Mono Display", weight: 400, case: "lower", size: 0.9 }, words: 2, motion: "scramble",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#3BFF8F", outline: K, outlineWidth: 2, cycle: ["#3BFF8F", "#00E5FF"] },
    container: "none", emoji: "end", symbols: { mode: "prefix", glyphs: ">", colors: ["#3BFF8F"] },
    sample: "access:🔐 granted to the vault",
  },
  {
    id: "rainbowhop", name: "Rainbow Hop", family: "letters", tier: "creator",
    hint: "Pastel letters hop one by one across the spoken word.",
    benchmark: "Kids, crafts and baking",
    type: { font: "Titan One", weight: 400, case: "none", size: 1 }, words: 2, motion: "rainbow",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: "#1B1B1B", outlineWidth: 3, letterColors: ["#FF8FAB", "#FFD166", "#8EF6A4", "#7FD1FF", "#C3A6FF"] },
    container: "none", emoji: "above",
    sample: "Magic:🦄 unicorn cake reveal",
  },
  {
    id: "typecolor", name: "Typewriter Colour", family: "letters", tier: "pro",
    hint: "Typed out letter by letter on cream paper, the spoken word in rust ink.",
    benchmark: "Video essays and letters",
    type: { font: "Special Elite", weight: 400, case: "none", size: 0.85 }, words: 5, motion: "typestep",
    placement: { y: "mid", align: "left" },
    colors: { base: "#2B2117", accent: "#C2410C", box: "#FFF8E7", cycle: ["#C2410C", "#1D4ED8"] },
    container: "line", emoji: "end",
    sample: "Dear diary:✍️ today I finally said yes",
  },
  {
    id: "stretch", name: "Stretch", family: "letters", tier: "pro",
    hint: "One word at a time, its letters drawing together from wide spacing, framed by dashes.",
    benchmark: "Meditation, breathing and calm luxury",
    type: { font: "Syncopate", weight: 700, case: "upper", size: 0.85 }, words: 1, motion: "stretch",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#20D68A", outline: K, outlineWidth: 2, cycle: ["#20D68A", "#B8A6FF"] },
    container: "none", emoji: "none", symbols: { mode: "flank", glyphs: "—", colors: ["#20D68A"] },
    sample: "Breathe in slowly breathe out",
  },
  {
    id: "outlinedraw", name: "Outline Draw", family: "letters", tier: "creator",
    hint: "Upcoming words wait as orange outlines; each one fills solid as it's spoken.",
    benchmark: "Design, art and process videos",
    type: { font: "Bowlby One", weight: 400, case: "upper", size: 1 }, words: 2, motion: "draw",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8A00", outline: K, outlineWidth: 2, cycle: ["#FF8A00", "#4CC9FF"] },
    container: "none", emoji: "end",
    sample: "Sketch:✏️ your idea before building",
  },
  {
    id: "glitchslice", name: "Glitch Slice", family: "letters", tier: "pro",
    hint: "Slices of the spoken word jitter sideways in red and cyan, like a broken signal.",
    benchmark: "Tech fails and horror-gaming edits",
    type: { font: "Rubik Glitch", weight: 400, case: "upper", size: 1 }, words: 2, motion: "slice",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: K, outlineWidth: 1.5, cycle: ["#FFFFFF", "#7CF8FF"], accent2: "#FF2D55" },
    container: "none", emoji: "end",
    sample: "Signal lost:⚡ reconnecting right now",
  },
  {
    id: "inkbloom", name: "Ink Bloom", family: "letters", tier: "creator",
    hint: "Italic serif words bloom out of a blot of ink into gold.",
    benchmark: "Poetry, books and storytelling",
    type: { font: "Playfair Display", weight: 700, italic: true, case: "none", size: 1 }, words: 3, motion: "ink",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#E8C26B", outline: "#00000099", outlineWidth: 1, cycle: ["#E8C26B", "#E8A0B0"] },
    container: "none", emoji: "none", symbols: { mode: "sparkle", glyphs: "✿", colors: ["#E8C26B"] },
    sample: "Some stories are written in ink",
  },
  {
    id: "marquee", name: "Marquee", family: "letters", tier: "pro",
    hint: "Shaded theatre lettering cascades in, pink on the spoken word, with sparkle bursts.",
    benchmark: "Openings, events and grand reveals",
    type: { font: "Bungee Shade", weight: 400, case: "upper", size: 0.9 }, words: 2, motion: "cascade",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF3D9A", cycle: ["#FF3D9A", "#FFD60A"] },
    container: "none", emoji: "burst",
    sample: "Grand opening:✨ this Saturday night",
  },

  // ── Neon Night ────────────────────────────────────────────────────────
  {
    id: "nightdrive", name: "Night Drive", family: "neon", tier: "creator",
    hint: "Inline neon tubes in icy blue; the spoken word flares white and the whole sign breathes.",
    benchmark: "Night-drive and city edits",
    type: { font: "Monoton", weight: 400, case: "upper", size: 0.8 }, words: 2, motion: "glow",
    placement: { y: "mid", align: "center" },
    colors: { base: "#BFF8FF", accent: W, glow: "#00E5FF", cycle: ["#FFFFFF", "#FF6EC7"] },
    container: "none", emoji: "sticker", loop: "breathe",
    sample: "Neon lights downtown:🌃 tonight",
  },
  {
    id: "pinkflicker", name: "Pink Flicker", family: "neon", tier: "creator",
    hint: "A pink neon sign that flickers on word by word, like a bulb warming up.",
    benchmark: "Bars, nightlife and late-night chat",
    type: { font: "Audiowide", weight: 400, case: "upper", size: 1 }, words: 2, motion: "flicker",
    placement: { y: "mid", align: "center" },
    colors: { base: "#FFD6FB", accent: "#FF3DF5", outline: "#2A0030", outlineWidth: 1, glow: "#FF3DF5", cycle: ["#FF3DF5", "#00E5FF"] },
    container: "none", emoji: "end",
    sample: "Open:💋 all night long baby",
  },
  {
    id: "laser", name: "Laser", family: "neon", tier: "pro",
    hint: "Sci-fi caps shooting in from the left in laser green, between targeting marks.",
    benchmark: "FPS and esports clips",
    type: { font: "Orbitron", weight: 900, case: "upper", size: 0.8 }, words: 2, motion: "slidel",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#39FF14", outline: "#001A00", outlineWidth: 1.5, cycle: ["#39FF14", "#00E5FF"] },
    container: "none", emoji: "none", symbols: { mode: "flank", glyphs: "◈", colors: ["#39FF14"] },
    sample: "Level up your aim tonight",
  },
  {
    id: "clubpulse", name: "Club Pulse", family: "neon", tier: "pro",
    hint: "The line pulses to an imaginary beat while words pop in magenta, cyan and yellow.",
    benchmark: "Club, festival and dance content",
    type: { font: "Kanit", weight: 800, case: "upper", size: 1 }, words: 3, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF3DF5", outline: "#120018", outlineWidth: 2, glow: "#FF3DF5", cycle: ["#FF3DF5", "#00E5FF", "#FFE14D"] },
    container: "none", emoji: "burst", loop: "pulse",
    sample: "Bass:🔊 drops in ten seconds",
  },
  {
    id: "afterglow", name: "Afterglow", family: "neon", tier: "creator",
    hint: "A warm orange shimmer on the spoken word and a slow float, like heat haze.",
    benchmark: "Sunset, rooftop and travel reels",
    type: { font: "Sora", weight: 800, case: "none", size: 1 }, words: 3, motion: "shimmer",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF9E6D", outline: "#2A0F00", outlineWidth: 2, cycle: ["#FF9E6D", "#FF5C8A"] },
    container: "none", emoji: "above", loop: "float",
    sample: "Golden:🌆 hour on the rooftop",
  },
  {
    id: "cybergrid", name: "Cyber Grid", family: "neon", tier: "pro",
    hint: "Red and cyan channels jitter on the spoken word under a REC badge.",
    benchmark: "Tech, AI and cyberpunk edits",
    type: { font: "Orbitron", weight: 900, case: "upper", size: 0.8 }, words: 2, motion: "rgb",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, cycle: ["#FFFFFF", "#00E5FF"] },
    container: "none", emoji: "none", symbols: { mode: "badge", glyphs: "REC ●", colors: ["#FF2D55"] },
    sample: "System online all units ready",
  },
  {
    id: "tubelight", name: "Tube Light", family: "neon", tier: "creator",
    hint: "Warm yellow tube lettering whose spoken word glows like it was just switched on.",
    benchmark: "Ideas, startup and late-night thinking",
    type: { font: "Bungee", weight: 400, case: "upper", size: 1 }, words: 2, motion: "glow",
    placement: { y: "mid", align: "center" },
    colors: { base: "#FFF6C9", accent: "#FFE14D", outline: "#1A1200", outlineWidth: 1, glow: "#FFB000", cycle: ["#FFE14D", "#FF8A3D"] },
    container: "none", emoji: "end",
    sample: "Big idea:💡 at three in the morning",
  },
  {
    id: "vaporneon", name: "Vapor Neon", family: "neon", tier: "pro",
    hint: "Script neon in pink, gently swaying like a sign in the breeze.",
    benchmark: "Retro Miami and vaporwave edits",
    type: { font: "Pacifico", weight: 400, case: "none", size: 1 }, words: 2, motion: "glow",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, glow: "#FF6EC7", cycle: ["#FFFFFF", "#7CF8FF"] },
    container: "none", emoji: "above", loop: "sway",
    sample: "Miami:🌴 nights hit different",
  },

  // ── Y2K & Chrome ──────────────────────────────────────────────────────
  {
    id: "chrome", name: "Chrome", family: "y2k", tier: "pro",
    hint: "Polished chrome capitals with silver sparkles glinting off the spoken word.",
    benchmark: "Y2K fashion and music edits",
    type: { font: "Syncopate", weight: 700, case: "upper", size: 0.8 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: "#DFE4F2", accent: "#C9D6FF", outline: "#1A1A2E", outlineWidth: 2, gradient: { from: "#FFFFFF", to: "#7D8299", target: "active" } },
    container: "none", emoji: "none", symbols: { mode: "sparkle", glyphs: "✧", colors: ["#FFFFFF", "#C9D6FF"] },
    sample: "The future is chrome and so are we",
  },
  {
    id: "butterfly", name: "Butterfly", family: "y2k", tier: "creator",
    hint: "Bubbly 2000s lettering that bounces, with flowers and a butterfly.",
    benchmark: "Glow-up and transformation reels",
    type: { font: "Rampart One", weight: 400, case: "none", size: 1 }, words: 2, motion: "bounce",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8AD8", outline: "#6A0F4A", outlineWidth: 2, cycle: ["#FF8AD8", "#9AD0FF"] },
    container: "none", emoji: "above", symbols: { mode: "sparkle", glyphs: "✿", colors: ["#FF8AD8", "#B8F2FF"] },
    sample: "Glow up:🦋 summer starts right now",
  },
  {
    id: "flipphone", name: "Flip Phone", family: "y2k", tier: "creator",
    hint: "Pixel text on a dim phone-screen panel; each word flashes like a backlight.",
    benchmark: "Nostalgia and texting skits",
    type: { font: "Silkscreen", weight: 400, case: "upper", size: 0.8 }, words: 3, motion: "flash",
    placement: { y: "mid", align: "center" },
    colors: { base: "#E6FBFF", accent: "#8AF0FF", cycle: ["#8AF0FF", "#FF8AD8"] },
    container: "glass", emoji: "end",
    sample: "Text me:📱 when you get home",
  },
  {
    id: "iced", name: "Iced", family: "y2k", tier: "pro",
    hint: "Inflated bubble letters in an icy gradient; keywords burst into diamonds.",
    benchmark: "Jewellery, sneakers and flex content",
    type: { font: "Rubik Bubbles", weight: 400, case: "upper", size: 1 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#E0F7FF", outline: "#0B1A3A", outlineWidth: 2, gradient: { from: "#E0F7FF", to: "#7AA7FF", target: "all" } },
    container: "none", emoji: "burst",
    sample: "Iced out:💎 and feeling brand new",
  },
  {
    id: "maincharacter", name: "Main Character", family: "y2k", tier: "pro",
    hint: "A fat retro script that ta-das on the spoken word and throws glitter.",
    benchmark: "POV and main-character edits",
    type: { font: "Shrikhand", weight: 400, case: "none", size: 1 }, words: 2, motion: "tada",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF9AD5", outline: "#4A0033", outlineWidth: 2, cycle: ["#FF9AD5", "#B8F2FF"] },
    container: "none", emoji: "none", symbols: { mode: "confetti", glyphs: "✦✧⋆", colors: ["#FF9AD5", "#FFFFFF", "#B8F2FF"] },
    sample: "*Main character *energy only today",
  },
  {
    id: "pixelheart", name: "Pixel Heart", family: "y2k", tier: "creator",
    hint: "Pixel letters drop in like a save screen, each line starting with a heart.",
    benchmark: "Cozy gaming and sims content",
    type: { font: "VT323", weight: 400, case: "upper", size: 1.35 }, words: 2, motion: "cascade",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF5C8A", outline: K, outlineWidth: 2, cycle: ["#FF5C8A", "#7CF8FF"] },
    container: "none", emoji: "end", symbols: { mode: "prefix", glyphs: "♥", colors: ["#FF5C8A"] },
    sample: "Saving:💾 my progress before bed",
  },
  {
    id: "holo", name: "Holo Sticker", family: "y2k", tier: "pro",
    hint: "A holographic violet sticker that sways; words flip over and a UFO sticker slaps on.",
    benchmark: "Alien, space and weird-core edits",
    type: { font: "Dela Gothic One", weight: 400, case: "upper", size: 1 }, words: 2, motion: "flip",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#E6FFFA", box: "#9B8CFF", cycle: ["#E6FFFA", "#FFE14D"] },
    container: "sticker", emoji: "sticker", loop: "sway",
    sample: "Alien:🛸 vibes all weekend long",
  },
  {
    id: "rollerdisco", name: "Roller Disco", family: "y2k", tier: "creator",
    hint: "Tall caps that swipe up in lime, like a roller-rink sign.",
    benchmark: "Skating, dance and weekend plans",
    type: { font: "Teko", weight: 600, case: "upper", size: 1.2 }, words: 3, motion: "swipe",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#C7F464", outline: K, outlineWidth: 2, cycle: ["#C7F464", "#FF6EC7"] },
    container: "none", emoji: "end",
    sample: "Roller:🛼 disco this Friday night",
  },

  // ── Hype & Sports ─────────────────────────────────────────────────────
  {
    id: "scoreboard", name: "Scoreboard", family: "hype", tier: "pro",
    hint: "A navy stadium bar where words roll up like a score, under a match-clock badge.",
    benchmark: "Match highlights and sports commentary",
    type: { font: "Oswald", weight: 700, case: "upper", size: 1 }, words: 3, motion: "roll",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#FFD60A", box: "#0B132B", cycle: ["#FFD60A", "#7CF8FF"] },
    container: "bar", emoji: "none", symbols: { mode: "badge", glyphs: "⏱ 90'", colors: ["#00A968"] },
    sample: "Final score three two in extra time",
  },
  {
    id: "fastbreak", name: "Fast Break", family: "hype", tier: "creator",
    hint: "Condensed caps that skid in from the left, with speed chevrons.",
    benchmark: "Basketball and fast-play highlights",
    type: { font: "Anton", weight: 400, case: "upper", size: 1.15 }, words: 2, motion: "slidel",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF8A00", outline: K, outlineWidth: 3, cycle: ["#FF8A00", "#FFE14D"] },
    container: "none", emoji: "end", symbols: { mode: "flank", glyphs: "»", colors: ["#FF8A00"] },
    sample: "Fast break:🏀 dunk at the buzzer",
  },
  {
    id: "gymrat", name: "Gym Rat", family: "hype", tier: "free",
    hint: "Tall condensed caps that punch in hard, in red, with a flexed arm on the effort word.",
    benchmark: "Gym and fitness creators (red is fitness's accent)",
    type: { font: "Bebas Neue", weight: 400, case: "upper", size: 1.3 }, words: 2, motion: "punch",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF2D55", outline: K, outlineWidth: 3, cycle: ["#FF2D55", "#FF8A00"] },
    container: "none", emoji: "above",
    sample: "Last rep:💪 is the one that counts",
  },
  {
    id: "stadium", name: "Stadium", family: "hype", tier: "pro",
    hint: "The winning word does a ta-da shake in pitch green while the keyword bursts.",
    benchmark: "Goals, wins and crowd moments",
    type: { font: "Archivo Black", weight: 400, case: "upper", size: 1.1 }, words: 2, motion: "tada",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#3BFF8F", outline: K, outlineWidth: 3, cycle: ["#3BFF8F", "#FFE14D"] },
    container: "none", emoji: "burst",
    sample: "GOAL:⚽ what a finish that was",
  },
  {
    id: "countdown", name: "Countdown", family: "hype", tier: "creator",
    hint: "One huge word at a time, squashing and stretching under a countdown badge.",
    benchmark: "Launch countdowns and race starts",
    type: { font: "Russo One", weight: 400, case: "upper", size: 1.6 }, words: 1, motion: "elastic",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: K, outlineWidth: 3, cycle: ["#FFD60A", "#FF2D55"] },
    container: "none", emoji: "none", symbols: { mode: "badge", glyphs: "3·2·1", colors: ["#FF2D55"] },
    sample: "Three two one go go go",
  },
  {
    id: "turbo", name: "Turbo", family: "hype", tier: "pro",
    hint: "Italic racing caps with a red offset shadow; each word flashes in cyan.",
    benchmark: "Cars, bikes and speed content",
    type: { font: "Kanit", weight: 800, italic: true, case: "upper", size: 1 }, words: 2, motion: "flash",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#00E5FF", outline: K, outlineWidth: 3, hardShadow: "#FF2D55", cycle: ["#00E5FF", "#FFE14D"] },
    container: "none", emoji: "end",
    sample: "Zero to hundred:🏎️ in three seconds",
  },
  {
    id: "champion", name: "Champion", family: "hype", tier: "pro",
    hint: "Stencil caps that swing down like a medal on its ribbon, in gold.",
    benchmark: "Medals, finals and personal bests",
    type: { font: "Black Ops One", weight: 400, case: "upper", size: 1 }, words: 2, motion: "swing",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFC83D", outline: K, outlineWidth: 2, cycle: ["#FFC83D", "#E5E4E2"] },
    container: "none", emoji: "above",
    sample: "Gold:🥇 medal on the very first try",
  },
  {
    id: "fightnight", name: "Fight Night", family: "hype", tier: "creator",
    hint: "Only the hit word shakes, in red, with a hard shadow and a glove burst.",
    benchmark: "Boxing, MMA and rivalry clips",
    type: { font: "Russo One", weight: 400, case: "upper", size: 1 }, words: 2, motion: "shake",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF2D55", outline: K, outlineWidth: 3, hardShadow: K, cycle: ["#FF2D55", "#FFD60A"] },
    container: "none", emoji: "burst",
    sample: "Round one:🥊 starts right now",
  },

  // ── Soft Aesthetic ────────────────────────────────────────────────────
  {
    id: "butter", name: "Butter", family: "soft", tier: "free",
    hint: "Lowercase italic serif in butter yellow, fading in line by line. No pops, no shouting.",
    benchmark: "The 2026 quiet-lowercase trend, in butter yellow",
    type: { font: "DM Serif Display", weight: 400, italic: true, case: "lower", size: 1 }, words: 4, motion: "fade",
    placement: { y: "low", align: "center" },
    colors: { base: "#F5D76E", accent: "#F5D76E", outline: "#00000073", outlineWidth: 1, cycle: ["#F5D76E", "#FFB7A0"] },
    container: "none", emoji: "end",
    sample: "slow sunday:🌼 with nowhere to be",
  },
  {
    id: "cloud", name: "Cloud", family: "soft", tier: "creator",
    hint: "Soft lowercase on a white cloud pill that floats; words rise gently into place.",
    benchmark: "Dreamy vlogs and study-with-me",
    type: { font: "Nunito", weight: 900, case: "lower", size: 0.9 }, words: 3, motion: "rise",
    placement: { y: "mid", align: "center" },
    colors: { base: "#3A4566", accent: "#6B84FF", box: "#FFFFFFE8", cycle: ["#6B84FF", "#FF9EC4"] },
    container: "pill", emoji: "above", loop: "float",
    sample: "head in the clouds:☁️ all day",
  },
  {
    id: "matcha", name: "Matcha", family: "soft", tier: "creator",
    hint: "A soft heavy serif; each word blooms in matcha green.",
    benchmark: "Café, morning-routine and wellness",
    type: { font: "Fraunces", weight: 900, case: "lower", size: 1 }, words: 3, motion: "ink",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#A7D49B", outline: "#00000080", outlineWidth: 1, cycle: ["#A7D49B", "#F2D7A6"] },
    container: "none", emoji: "end",
    sample: "matcha:🍵 before anything else",
  },
  {
    id: "petal", name: "Petal", family: "soft", tier: "pro",
    hint: "Delicate italic words drifting out of a blur, with petals blooming round them.",
    benchmark: "Spring, florals and bridal content",
    type: { font: "Instrument Serif", weight: 400, italic: true, case: "lower", size: 1.25 }, words: 3, motion: "blur",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFB7C5", outline: "#00000066", outlineWidth: 1, cycle: ["#FFB7C5", "#D9C2FF"] },
    container: "none", emoji: "none", symbols: { mode: "sparkle", glyphs: "✿", colors: ["#FFB7C5", "#FFFFFF"] },
    sample: "spring is finally here again",
  },
  {
    id: "journal", name: "Journal", family: "soft", tier: "creator",
    hint: "Felt-pen handwriting that wobbles on as if it was just written.",
    benchmark: "Gratitude lists and journaling",
    type: { font: "Gloria Hallelujah", weight: 400, case: "lower", size: 0.9 }, words: 3, motion: "wobble",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD6A5", outline: "#0000008C", outlineWidth: 1.5, cycle: ["#FFD6A5", "#A0E7E5"] },
    container: "none", emoji: "end",
    sample: "things that made me smile:📓 today",
  },
  {
    id: "lavender", name: "Lavender", family: "soft", tier: "creator",
    hint: "Thin lavender lowercase; unspoken words fade back, every line starts with a moon.",
    benchmark: "Night routines and sleep content",
    type: { font: "Lexend", weight: 300, case: "lower", size: 0.85 }, words: 5, motion: "dim",
    placement: { y: "low", align: "center" },
    colors: { base: "#E4D9FF", accent: "#E4D9FF", outline: "#00000073", outlineWidth: 1, cycle: ["#E4D9FF", "#FFD6E8"] },
    container: "none", emoji: "none", symbols: { mode: "prefix", glyphs: "⏾", colors: ["#C9B6FF"] },
    sample: "a quiet night in with tea and a book",
  },
  {
    id: "sunlit", name: "Sunlit", family: "soft", tier: "pro",
    hint: "A fashion-magazine italic in warm cream; lines rise in and words lift into place.",
    benchmark: "Coastal travel and slow living",
    type: { font: "Bodoni Moda", weight: 700, italic: true, case: "lower", size: 1 }, words: 3, motion: "rise",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFE6A7", outline: "#00000073", outlineWidth: 1, cycle: ["#FFE6A7", "#FFB38A"] },
    container: "none", emoji: "above", entry: "up",
    sample: "golden mornings:☀️ by the sea",
  },
  {
    id: "cotton", name: "Cotton", family: "soft", tier: "creator",
    hint: "Words in soft pastel cotton bubbles that puff up as they're spoken.",
    benchmark: "Home, nursery and cozy-season posts",
    type: { font: "Nunito", weight: 900, case: "lower", size: 1 }, words: 2, motion: "bubble",
    placement: { y: "mid", align: "center" },
    colors: { base: "#4A3B52", accent: "#4A3B52", palette: ["#FDE2F3", "#E5F4FF", "#FFF4D6", "#E8FFE8"] },
    container: "none", emoji: "end",
    sample: "cozy:🧸 blanket season is back",
  },

  // ── Explainer & Business ──────────────────────────────────────────────
  {
    id: "checklist", name: "Checklist", family: "edu", tier: "free",
    hint: "Every line opens with an emerald tick on a glass panel; words rise in as they're said.",
    benchmark: "Tutorials and how-to steps",
    type: { font: "Inter", weight: 700, case: "none", size: 0.85 }, words: 4, motion: "rise",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: "#20D68A", cycle: ["#20D68A", "#4CC9FF"] },
    container: "glass", emoji: "none", symbols: { mode: "prefix", glyphs: "✓", colors: ["#20D68A"] },
    sample: "Step one open the settings page",
  },
  {
    id: "stepcounter", name: "Step Counter", family: "edu", tier: "free",
    hint: "A lower-third with a blue step badge; a blue bar sweeps under each spoken word.",
    benchmark: "Courses, recipes and process videos",
    type: { font: "Manrope", weight: 700, case: "none", size: 0.85 }, words: 4, motion: "underline",
    placement: { y: "low", align: "left" },
    colors: { base: W, accent: W, box: "#4CC9FF", box2: "#4CC9FF", boxCycle: ["#4CC9FF", "#20D68A"] },
    container: "dark", emoji: "none", symbols: { mode: "badge", glyphs: "STEP 1", colors: ["#0A84FF"] },
    sample: "First set your budget then track it weekly",
  },
  {
    id: "statpop", name: "Stat Pop", family: "edu", tier: "creator",
    hint: "Numbers and keywords roll up like a counter in lime, with a chart emoji.",
    benchmark: "Data, growth and case-study clips",
    type: { font: "Sora", weight: 800, case: "none", size: 1 }, words: 3, motion: "roll",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#B8FF3B", outline: K, outlineWidth: 2, cycle: ["#B8FF3B", "#4CC9FF"] },
    container: "none", emoji: "above",
    sample: "Sales grew:📈 three hundred percent",
  },
  {
    id: "protip", name: "Pro Tip", family: "edu", tier: "creator",
    hint: "A gold PRO TIP badge; the spoken word sits in an emerald box.",
    benchmark: "Productivity and career advice",
    type: { font: "Plus Jakarta Sans", weight: 700, case: "none", size: 1 }, words: 3, motion: "boxword",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#04130C", outline: "#00000080", outlineWidth: 1, box: "#20D68A", boxCycle: ["#20D68A", "#FFC83D"] },
    container: "none", emoji: "none", symbols: { mode: "badge", glyphs: "★ PRO TIP", colors: ["#C98A00"] },
    sample: "Batch your emails twice a day",
  },
  {
    id: "mythbuster", name: "Myth Buster", family: "edu", tier: "creator",
    hint: "The wrong idea shakes in red between crosses, so viewers know it's being debunked.",
    benchmark: "Myth-versus-fact explainers",
    type: { font: "Montserrat", weight: 900, case: "upper", size: 1 }, words: 2, motion: "shake",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF2D55", outline: K, outlineWidth: 3, cycle: ["#FF2D55", "#FFD60A"] },
    container: "none", emoji: "end", symbols: { mode: "flank", glyphs: "✕", colors: ["#FF2D55"] },
    sample: "Myth:❌ you need money to start",
  },
  {
    id: "explainer", name: "Explainer", family: "edu", tier: "free",
    hint: "Calm sentence case; a blue arrow points at each spoken word as a bar sweeps under it.",
    benchmark: "Finance and science explainers",
    type: { font: "DM Sans", weight: 500, case: "none", size: 1 }, words: 4, motion: "underline",
    placement: { y: "low", align: "center" },
    colors: { base: W, accent: W, outline: "#0000008C", outlineWidth: 1, box: "#4CC9FF", boxCycle: ["#4CC9FF", "#FFD60A"] },
    container: "none", emoji: "none", symbols: { mode: "arrow", glyphs: "→", colors: ["#4CC9FF"] },
    sample: "This is why interest rates matter to you",
  },
  {
    id: "quickmath", name: "Quick Math", family: "edu", tier: "pro",
    hint: "Numbers scramble like a calculator before they settle, after an equals sign.",
    benchmark: "Maths, money and quiz content",
    type: { font: "Space Grotesk", weight: 700, case: "none", size: 1 }, words: 3, motion: "scramble",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFD60A", outline: K, outlineWidth: 2, cycle: ["#FFD60A", "#4CC9FF"] },
    container: "none", emoji: "end", symbols: { mode: "prefix", glyphs: "=", colors: ["#FFD60A"] },
    sample: "Ten percent of fifty:🧮 is five",
  },
  {
    id: "casestudy", name: "Case Study", family: "edu", tier: "pro",
    hint: "An orange-edged lower-third with a play mark; words swipe up like a presentation.",
    benchmark: "Business breakdowns and founder stories",
    type: { font: "Inter Tight", weight: 800, case: "none", size: 0.85 }, words: 4, motion: "swipe",
    placement: { y: "low", align: "left" },
    colors: { base: W, accent: "#FFB86B", box2: "#FF8A00", cycle: ["#FFB86B", "#FFE14D"] },
    container: "dark", emoji: "none", symbols: { mode: "prefix", glyphs: "▶", colors: ["#FF8A00"] },
    sample: "How a small bakery hit one crore in sales",
  },

  // ── Desi Festival ─────────────────────────────────────────────────────
  {
    id: "diwali", name: "Diwali", family: "fest", tier: "pro",
    hint: "Devanagari in shimmering diya gold, with sparks and a lamp above the greeting.",
    benchmark: "Diwali greetings and festive sales",
    type: { font: "Yatra One", weight: 400, case: "none", size: 1.1 }, words: 2, motion: "shimmer",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFC83D", outline: "#4A1500", outlineWidth: 3, cycle: ["#FFC83D", "#FF9933"] },
    container: "none", emoji: "above", symbols: { mode: "sparkle", glyphs: "✦", colors: ["#FFC83D", "#FF9933"] }, script: "devanagari",
    sample: "शुभ दीपावली:🪔 आप सभी को",
  },
  {
    id: "holi", name: "Holi", family: "fest", tier: "creator",
    hint: "Every letter splashed a different gulal colour, with a paint burst on the keyword.",
    benchmark: "Holi reels and colour-play videos",
    type: { font: "Baloo 2", weight: 800, case: "none", size: 1.1 }, words: 2, motion: "pop",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: W, outline: "#1B1B1B", outlineWidth: 3, cycle: ["#FF3D9A", "#FFD60A", "#3BFF8F", "#00C2FF", "#9B5CFF"] },
    container: "none", emoji: "burst", script: "devanagari",
    sample: "होली:🎨 है भाई रंग लगाओ",
  },
  {
    id: "dhamaal", name: "Dhamaal", family: "fest", tier: "creator",
    hint: "Classic Devanagari that twirls in, in saffron, like a dance spin.",
    benchmark: "Dance reels and wedding sangeet",
    type: { font: "Tiro Devanagari Hindi", weight: 400, case: "none", size: 1.15 }, words: 2, motion: "spin",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF9933", outline: "#3A1200", outlineWidth: 3, cycle: ["#FF9933", "#FF3D9A"] },
    container: "none", emoji: "end", script: "devanagari",
    sample: "नाचो:💃 जैसे कोई देख नहीं रहा",
  },
  {
    id: "cricketfever", name: "Cricket Fever", family: "fest", tier: "pro",
    hint: "Bold Devanagari that punches in, in jersey blue, under a LIVE badge.",
    benchmark: "Cricket reactions and match moments",
    type: { font: "Hind", weight: 700, case: "none", size: 1.15 }, words: 2, motion: "punch",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#00B2FF", outline: "#00142A", outlineWidth: 3, cycle: ["#00B2FF", "#FF9933"] },
    container: "none", emoji: "burst", symbols: { mode: "badge", glyphs: "● LIVE", colors: ["#C8102E"] }, script: "devanagari",
    sample: "छक्का:🏏 आखिरी गेंद पर",
  },
  {
    id: "desiswag", name: "Desi Swag", family: "fest", tier: "free",
    hint: "Hinglish in saffron, yellow and green, each word tilting the other way.",
    benchmark: "Hinglish tips and desi creator talk",
    type: { font: "Mukta", weight: 800, case: "none", size: 1 }, words: 3, motion: "tiltswap",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF9933", outline: K, outlineWidth: 3, cycle: ["#FF9933", "#FFD60A", "#20D68A"] },
    container: "none", emoji: "end",
    sample: "Bhai ye trick:🔥 kisi ko mat batana",
  },
  {
    id: "mehendi", name: "Mehendi", family: "fest", tier: "creator",
    hint: "Handwritten Devanagari blooming in henna orange between flower marks.",
    benchmark: "Wedding functions and bridal content",
    type: { font: "Kalam", weight: 700, case: "none", size: 1.05 }, words: 3, motion: "ink",
    placement: { y: "mid", align: "center" },
    colors: { base: "#FFE8D1", accent: "#FF9A5A", outline: "#3A1200", outlineWidth: 2, cycle: ["#FF9A5A", "#FFD27A"] },
    container: "none", emoji: "end", symbols: { mode: "flank", glyphs: "❀", colors: ["#FF9A5A"] }, script: "devanagari",
    sample: "मेहंदी:🌿 की रस्म शुरू हो गई",
  },

  // ── Celebrations & Drops ──────────────────────────────────────────────
  {
    id: "birthday", name: "Birthday Blast", family: "season", tier: "creator",
    hint: "Party colours bouncing word by word, a cake on the keyword and confetti on the big words.",
    benchmark: "Birthday wishes and surprise reveals",
    type: { font: "Luckiest Guy", weight: 400, case: "upper", size: 1 }, words: 2, motion: "bounce",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF4D6D", outline: K, outlineWidth: 3, cycle: ["#FF4D6D", "#FFD60A", "#4CC9FF"] },
    container: "none", emoji: "above", symbols: { mode: "confetti", glyphs: "✦●▲", colors: ["#FF4D6D", "#FFD60A", "#4CC9FF"] },
    sample: "Happy *birthday:🎂 to the *best mom ever",
  },
  {
    id: "newyear", name: "New Year", family: "season", tier: "pro",
    hint: "Gold serif that flashes like a camera bulb, with gold and silver confetti.",
    benchmark: "New Year countdowns and recaps",
    type: { font: "Abril Fatface", weight: 400, case: "none", size: 1.1 }, words: 2, motion: "flash",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FFC83D", outline: "#2A1C00", outlineWidth: 2, cycle: ["#FFC83D", "#E5E4E2"] },
    container: "none", emoji: "none", symbols: { mode: "confetti", glyphs: "✦✧⋆", colors: ["#FFC83D", "#FFFFFF", "#E5E4E2"] },
    sample: "Three two one *happy *new *year",
  },
  {
    id: "spooky", name: "Spooky", family: "season", tier: "creator",
    hint: "Dripping horror letters flickering in pumpkin orange, gently swaying.",
    benchmark: "Halloween, horror and storytime",
    type: { font: "Creepster", weight: 400, case: "upper", size: 1.1 }, words: 2, motion: "flicker",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#FF7518", outline: K, outlineWidth: 2, cycle: ["#FF7518", "#B388FF"] },
    container: "none", emoji: "end", loop: "sway",
    sample: "Something is behind:👻 you right now",
  },
  {
    id: "winterdrop", name: "Winter Drop", family: "season", tier: "pro",
    hint: "Icy blue words swing in on a hinge while snowflakes fall behind the caption.",
    benchmark: "Winter collections and first-snow posts",
    type: { font: "Bricolage Grotesque", weight: 800, case: "none", size: 1 }, words: 3, motion: "swing",
    placement: { y: "mid", align: "center" },
    colors: { base: W, accent: "#BFE9FF", outline: "#0A1A33", outlineWidth: 2, cycle: ["#BFE9FF", "#E4D9FF"] },
    container: "none", emoji: "rain",
    sample: "First snow:❄️ of the season is here",
  },
];

export const DEFAULT_CAPTION_TEMPLATE_ID = "clean";

const BY_ID = new Map(CAPTION_TEMPLATES.map((t) => [t.id, t]));

/**
 * Ids that existed before this library, mapped to their closest replacement.
 * They live on in saved clips, brand kits, phone preferences and the public
 * API, so they must keep resolving. Covers the 6 original native looks and all
 * 45 retired partner templates.
 */
export const LEGACY_TEMPLATE_ALIASES: Readonly<Record<string, string>> = {
  // Original native looks
  hormozi: "boardroom",
  podcast: "studio",
  minimal: "lowkey",
  neon: "neontrace",
  news: "documentary",
  // Curated partner templates
  "viral-bold-01": "boardroom",
  "viral-bold-02": "cashflow",
  "viral-punch": "shockwave",
  "viral-beast": "slam",
  "high-energy": "hypestack",
  "creator-modern": "spotlight",
  "creator-pop": "bubblegum",
  "podcast-bold": "studio",
  "clean-minimal": "clean",
  "clean-white": "pill",
  "luxury-clean": "documentary",
  "professional-01": "keynote",
  // The rest of the partner library, by the look family it was filed under
  "hormozi-4": "boardroom",
  matt: "boardroom", caleb: "boardroom", dan: "boardroom", bob: "boardroom",
  jess: "shockwave", kendrick: "shockwave", devin: "shockwave", karl: "shockwave",
  jack: "spotlight", lewis: "spotlight", tayo: "spotlight", umi: "spotlight",
  nick: "clean", doug: "clean", ella: "clean", noah: "clean",
  laura: "studio", luke: "studio", tracy: "studio", gstaad: "studio",
  "kelly-2": "documentary", mark: "documentary", jason: "documentary", malta: "documentary",
  claire: "redbox", daniel: "redbox", william: "redbox", nema: "redbox",
  michael: "splittone", "dan-2": "splittone", leon: "splittone", seth: "splittone",
};

/** Maps any id (current, legacy, unknown) to a current template id. Never throws. */
export function resolveTemplateId(id: string | null | undefined): string {
  if (!id) return DEFAULT_CAPTION_TEMPLATE_ID;
  if (BY_ID.has(id)) return id;
  const alias = LEGACY_TEMPLATE_ALIASES[id];
  return alias && BY_ID.has(alias) ? alias : DEFAULT_CAPTION_TEMPLATE_ID;
}

/** Exact lookup by current id; null for unknown ids. Use resolveCaptionTemplate to follow aliases. */
export function findCaptionTemplate(id: string | null | undefined): CaptionTemplateSpec | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Alias-aware lookup that always returns a template. */
export function resolveCaptionTemplate(id: string | null | undefined): CaptionTemplateSpec {
  return BY_ID.get(resolveTemplateId(id))!;
}

/** Whether `id` names a current or legacy template. */
export function isKnownTemplateId(id: string | null | undefined): boolean {
  return !!id && (BY_ID.has(id) || id in LEGACY_TEMPLATE_ALIASES);
}

const TIER_RANK: Record<string, number> = { free: 0, lite: 0, creator: 1, pro: 2, studio: 3 };

/**
 * Whether a user on `userTier` may pick a template of `templateTier`.
 * Same ordering as lib/plans/tiers.ts (free < creator < pro < studio); an
 * unknown user tier is treated as free.
 */
export function templateTierAllowed(templateTier: CaptionTier, userTier: string | null | undefined): boolean {
  return (TIER_RANK[userTier ?? "free"] ?? 0) >= (TIER_RANK[templateTier] ?? 0);
}

export const CAPTION_TIER_LABEL: Record<CaptionTier, string> = { free: "Free", creator: "Creator", pro: "Pro" };

export interface CaptionSampleToken {
  text: string;
  emoji: string | null;
  emphasis: boolean;
}

/** Splits a template's preview line into words with their marked emoji and emphasis. */
export function parseCaptionSample(sample: string): CaptionSampleToken[] {
  return sample.split(/\s+/).filter(Boolean).map((raw) => {
    let s = raw;
    const emphasis = s.startsWith("*");
    if (emphasis) s = s.slice(1);
    const k = s.indexOf(":");
    return k > 0 ? { text: s.slice(0, k), emoji: s.slice(k + 1), emphasis } : { text: s, emoji: null, emphasis };
  });
}

/** The decoder motion's steps: random glyphs settle into the word over this many 45 ms frames. */
export const SCRAMBLE_STEPS = 6;
export const SCRAMBLE_STEP_MS = 45;
const SCRAMBLE_GLYPHS = "!<>-_/[]=+*^?#0123456789";

/**
 * What a decoding word shows at `step` (0..SCRAMBLE_STEPS-1): the first part
 * of the word already settled, the rest random glyphs. Deterministic per
 * (seed, step), so the picker preview and the export show the same glyphs.
 */
export function scrambledWord(text: string, seed: number, step: number): string {
  let a = (seed * 31 + step) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const chars = Array.from(text);
  return chars
    .map((ch, k) => (k < ((step + 1) * chars.length) / SCRAMBLE_STEPS || !ch.trim() ? ch : SCRAMBLE_GLYPHS[Math.floor(rnd() * SCRAMBLE_GLYPHS.length)]))
    .join("");
}

/** Templates grouped by family, in family order. */
export function captionTemplatesByFamily(): { family: CaptionFamily; templates: CaptionTemplateSpec[] }[] {
  return CAPTION_FAMILIES.map((family) => ({ family, templates: CAPTION_TEMPLATES.filter((t) => t.family === family.id) }));
}
