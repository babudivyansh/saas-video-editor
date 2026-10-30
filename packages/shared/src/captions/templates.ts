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
  | "chroma";

/** How the spoken word (or line) animates. Names match the engine registry. */
export type CaptionMotionId =
  | "pop" | "pops" | "slam" | "bounce" | "color" | "dim" | "karaoke" | "boxword"
  | "stack" | "rise" | "fade" | "cut" | "bold" | "emph" | "bubble" | "blocks"
  | "glow" | "marker" | "underline" | "hollow" | "split" | "shake" | "wobble"
  | "blur" | "zoom" | "type" | "typestep" | "flicker" | "step" | "rgb" | "fontswitch"
  | "heartbeat" | "punch" | "drop" | "elastic" | "jelly" | "stamp" | "tiltswap";

export const CAPTION_MOTIONS: readonly CaptionMotionId[] = [
  "pop", "pops", "slam", "bounce", "color", "dim", "karaoke", "boxword",
  "stack", "rise", "fade", "cut", "bold", "emph", "bubble", "blocks",
  "glow", "marker", "underline", "hollow", "split", "shake", "wobble",
  "blur", "zoom", "type", "typestep", "flicker", "step", "rgb", "fontswitch",
  "heartbeat", "punch", "drop", "elastic", "jelly", "stamp", "tiltswap",
];

/** The shape the line sits on, if any. */
export type CaptionContainer = "none" | "pill" | "bar" | "line" | "glass" | "sticker" | "dark" | "wordbox";

export type CaptionEmojiMode = "none" | "above" | "end" | "burst" | "rain";

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

  // ── Gradient Pop (drop 1) ─────────────────────────────────────────────────
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

  // ── Colour Switch (drop 1) ────────────────────────────────────────────────
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

const TIER_RANK: Record<string, number> = { free: 0, creator: 1, pro: 2, studio: 3 };

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

/** Templates grouped by family, in family order. */
export function captionTemplatesByFamily(): { family: CaptionFamily; templates: CaptionTemplateSpec[] }[] {
  return CAPTION_FAMILIES.map((family) => ({ family, templates: CAPTION_TEMPLATES.filter((t) => t.family === family.id) }));
}
