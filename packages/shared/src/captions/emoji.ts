// Which spoken words get an emoji in captions.
//
// Deliberately a curated keyword map rather than an LLM call per clip: emoji
// placement is decoration, and a wrong-but-confident emoji is worse than none.
// Matching is on whole words only, so "assessment" never becomes "ass 🍑".
// Keys are matched after lowercasing and stripping everything that isn't a
// letter or combining mark in any script, so Devanagari keywords match too.
//
// Every emoji used here needs a PNG in public/emoji/ (the render draws colour
// emoji as image overlays because libass can't); scripts/check-caption-templates.mjs
// enforces that.

const BY_EMOJI: Record<string, string> = {
  "💰": "money cash dollars dollar paid salary income wealth rich richer millionaire billionaire paisa paise paisay rupees rupaye पैसा पैसे रुपये रुपए दौलत",
  "💸": "spend spent spending expensive price prices cost costs crore lakh lakhs करोड़ लाख खर्च",
  "📈": "revenue profit profits growth grow growing scale scaling increase sales stocks investing invest investment",
  "📉": "loss losses crash dropped decline",
  "🔥": "fire insane lit hot viral jhakaas आग",
  "🤯": "crazy mind mindblowing unbelievable",
  "😱": "shocking shocked scary terrifying what",
  "❤️": "love loved lovely heart pyaar dil प्यार दिल मोहब्बत",
  "🏆": "best win winning winner champion trophy victory jeet जीत सफलता",
  "🥇": "first gold number",
  "⏰": "time hours minutes deadline late early waqt समय वक्त",
  "⚡": "fast quick quickly instantly instant speed faster",
  "💡": "idea ideas tip tips hack hacks trick tricks lesson jugaad तरीका ट्रिक",
  "🤔": "think thinking wonder why maybe",
  "❓": "question questions how",
  "🤫": "secret secrets hidden nobody राज़ राज सीक्रेट",
  "⚠️": "warning careful danger mistake mistakes",
  "🛑": "stop quit never",
  "💥": "boom explode exploded explosion impact dhamaka धमाका",
  "🚀": "huge massive launch launched rocket skyrocket rocketed",
  "😂": "laugh funny hilarious joke lol hasi हंसी",
  "😊": "happy happiness smile khush खुश",
  "😢": "sad cry crying tears दुख",
  "😡": "angry mad furious gussa गुस्सा",
  "🧠": "brain smart genius intelligent dimag दिमाग",
  "💪": "strong strength gym workout muscle discipline mehnat मेहनत ताकत",
  "💼": "work job career business office boss बिज़नेस बिजनेस",
  "🤝": "team partner deal bhai dost yaar भाई दोस्त",
  "📊": "data numbers stats statistics chart",
  "🎉": "party celebrate celebration congrats congratulations finally",
  "🥳": "birthday subscribers milestone",
  "✨": "magic beautiful glow aesthetic dream dreams sapne sapna सपने सपना",
  "💯": "hundred percent perfect exactly",
  "👀": "look watch see eyes",
  "🙏": "thanks thank grateful please",
  "🎯": "goal goals target focus",
  "📱": "phone app iphone android",
  "💻": "code coding laptop computer developer software",
  "🤖": "ai robot automation",
  "🌍": "world global travel country",
  "✈️": "flight plane trip",
  "🏠": "home house ghar घर",
  "☕": "coffee chai चाय",
  "🍕": "pizza",
  "🍛": "food khana खाना",
  "🏏": "cricket क्रिकेट",
  "⚽": "football soccer",
  "🎵": "music song songs",
  "🎬": "movie film",
  "📚": "study studying book books learn learning",
  "😎": "cool confident bindaas",
  "😴": "sleep tired",
  "💍": "marriage wedding shaadi शादी",
  "👑": "king queen boss",
  "🐱": "cat",
  "🐶": "dog puppy",
  "🍯": "sugar honey sweet",
  "💋": "lips lipstick gloss",
  "👾": "game gaming boss",
  "☝️": "one",
};

export const EMOJI_MAP: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [emoji, words] of Object.entries(BY_EMOJI)) {
    for (const w of words.split(/\s+/)) if (w && !(w in out)) out[w] = emoji;
  }
  return out;
})();

/** Every emoji the planner can emit (each needs a PNG asset). */
export const EMOJI_SET: readonly string[] = Object.keys(BY_EMOJI);

export const MAX_EMOJI_PER_CLIP = 6;
export const MIN_WORDS_BETWEEN_EMOJI = 8;

/** Lowercase, letters and combining marks only, any script. */
export function emojiKey(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
}

/**
 * Choose which words get an emoji. Rate-limited on purpose: an emoji on every
 * recognised word turns captions into confetti. Returns word index → emoji.
 */
export function planEmoji(words: { word: string }[], enabled: boolean): Record<number, string> {
  if (!enabled) return {};
  const out: Record<number, string> = {};
  let placed = 0;
  let lastIndex = -Infinity;

  for (let i = 0; i < words.length && placed < MAX_EMOJI_PER_CLIP; i++) {
    if (i - lastIndex < MIN_WORDS_BETWEEN_EMOJI) continue;
    const emoji = EMOJI_MAP[emojiKey(words[i]!.word)];
    if (!emoji) continue;
    out[i] = emoji;
    placed++;
    lastIndex = i;
  }
  return out;
}

/** File name of an emoji's PNG under public/emoji/ (Noto naming: codepoints, no variation selectors). */
export function emojiAssetName(emoji: string): string {
  const cps = Array.from(emoji)
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16));
  return `emoji_u${cps.join("_")}.png`;
}
