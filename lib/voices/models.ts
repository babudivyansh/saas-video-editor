// Which ElevenLabs model reads a voiceover, and which languages it can read.
// Plain data, no server imports: the voiceover page quotes and filters with the
// same table the route validates against.
//
// Verified against GET /v1/models on 2026-11-01:
//
//   eleven_v4_turbo  94 languages, 0.5 ElevenLabs credits per char, 10,000 chars
//   eleven_v4        94 languages, 1.0 credit per char,             10,000 chars
//   eleven_flash_v2_5 (the model every voiceover used before) 32 languages
//
// Both v4 models return /with-timestamps in the same alignment shape as Flash,
// so buildWordTimings needs no change. Neither honours voice_settings.style
// (`can_use_style: false`) — which is why the voiceover page no longer has an
// "Exaggeration" slider. It never did anything on Flash either.

import type { VoiceoverQuality } from "@/lib/audio-pricing";

export const TTS_MODEL: Record<VoiceoverQuality, string> = {
  standard: "eleven_v4_turbo",
  studio: "eleven_v4",
};

/** The provider's per-request limit for both v4 models. */
export const VOICEOVER_MAX_CHARS = 10_000;

/** "auto" lets the model detect the language from the script. */
export const AUTO_LANGUAGE = "auto";

/** Every language eleven_v4 / eleven_v4_turbo speak, as the API names them. */
export const TTS_LANGUAGES: { code: string; label: string }[] = [
  ["af", "Afrikaans"], ["am", "Amharic"], ["ar", "Arabic"], ["hy", "Armenian"], ["as", "Assamese"],
  ["ast", "Asturian"], ["az", "Azerbaijani"], ["be", "Belarusian"], ["bn", "Bengali"], ["bs", "Bosnian"],
  ["bg", "Bulgarian"], ["my", "Burmese"], ["yue", "Cantonese"], ["ca", "Catalan"], ["ceb", "Cebuano"],
  ["ny", "Chichewa"], ["hr", "Croatian"], ["cs", "Czech"], ["da", "Danish"], ["nl", "Dutch"],
  ["en", "English"], ["et", "Estonian"], ["fil", "Filipino"], ["fi", "Finnish"], ["fr", "French"],
  ["ff", "Fula (Pulaar)"], ["gl", "Galician"], ["ka", "Georgian"], ["de", "German"], ["el", "Greek"],
  ["gu", "Gujarati"], ["ha", "Hausa"], ["he", "Hebrew"], ["hi", "Hindi"], ["hu", "Hungarian"],
  ["is", "Icelandic"], ["id", "Indonesian"], ["ga", "Irish"], ["it", "Italian"], ["ja", "Japanese"],
  ["jv", "Javanese"], ["kam", "Kamba"], ["kn", "Kannada"], ["kk", "Kazakh"], ["ky", "Kyrgyz"],
  ["ko", "Korean"], ["lo", "Lao"], ["lv", "Latvian"], ["ln", "Lingala"], ["lt", "Lithuanian"],
  ["lg", "Luganda"], ["lb", "Luxembourgish"], ["mk", "Macedonian"], ["ms", "Malay"], ["ml", "Malayalam"],
  ["mt", "Maltese"], ["zh", "Mandarin Chinese"], ["mi", "Maori"], ["mr", "Marathi"], ["mn", "Mongolian"],
  ["ne", "Nepali"], ["no", "Norwegian"], ["oc", "Occitan"], ["or", "Odia"], ["ps", "Pashto"],
  ["fa", "Persian"], ["pl", "Polish"], ["pt", "Portuguese"], ["pa", "Punjabi"], ["ro", "Romanian"],
  ["ru", "Russian"], ["sr", "Serbian"], ["sn", "Shona"], ["sd", "Sindhi"], ["sk", "Slovak"],
  ["sl", "Slovenian"], ["so", "Somali"], ["ckb", "Sorani Kurdish"], ["es", "Spanish"], ["sw", "Swahili"],
  ["sv", "Swedish"], ["tg", "Tajik"], ["ta", "Tamil"], ["te", "Telugu"], ["th", "Thai"],
  ["tr", "Turkish"], ["uk", "Ukrainian"], ["ur", "Urdu"], ["uz", "Uzbek"], ["vi", "Vietnamese"],
  ["cy", "Welsh"], ["wo", "Wolof"], ["yo", "Yoruba"], ["zu", "Zulu"],
].map(([code, label]) => ({ code, label }));

const CODES = new Set(TTS_LANGUAGES.map((l) => l.code));

/** A language the voiceover models accept, or "auto". Anything else is null. */
export function normalizeTtsLanguage(code: unknown): string | null {
  if (code == null || code === "" || code === AUTO_LANGUAGE) return AUTO_LANGUAGE;
  return typeof code === "string" && CODES.has(code) ? code : null;
}

export function ttsLanguageLabel(code: string): string {
  return TTS_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Scripts written without spaces between words: duration goes by characters. */
const CHAR_TIMED = new Set(["zh", "yue", "ja", "th", "lo", "my", "ko"]);

/**
 * Rough spoken length of a script, in seconds. Word count at 150 wpm, except
 * for scripts with no spaces between words (it said 0:00 for any Chinese or
 * Japanese script), which go by ~6 characters a second.
 */
export function estimateSpokenSeconds(text: string, language: string = AUTO_LANGUAGE): number {
  const t = text.trim();
  if (!t) return 0;
  const cjk = (t.match(/[぀-ヿ㐀-鿿가-힯฀-໿က-႟]/g) ?? []).length;
  if (CHAR_TIMED.has(language) || cjk > t.length / 3) return Math.round(t.replace(/\s+/g, "").length / 6);
  return Math.round((t.split(/\s+/).length / 150) * 60);
}
