// Plain data, deliberately dependency-free (no `lib/env` import) so it's
// safe to import from CLIENT components — utils/elevenlabs.ts is
// server-only (it imports lib/env for API keys), so anything importing
// from it gets that whole server-only module, secrets-parsing and all,
// bundled into the browser. Both the (server) dubbing route and the
// (client) Caption panel's language selector import this instead.

// Supported dubbing/transcription languages (code → label). Subset of
// ElevenLabs' 29+.
export const DUB_LANGUAGES: { code: string; label: string }[] = [
  { code: "es", label: "Spanish" }, { code: "fr", label: "French" }, { code: "de", label: "German" },
  { code: "hi", label: "Hindi" }, { code: "pt", label: "Portuguese" }, { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" }, { code: "ko", label: "Korean" }, { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" }, { code: "ru", label: "Russian" }, { code: "id", label: "Indonesian" },
  { code: "nl", label: "Dutch" }, { code: "tr", label: "Turkish" }, { code: "pl", label: "Polish" },
  { code: "en", label: "English" },
];

// Caption translation is text-only, so it isn't limited to the languages a
// voice model can speak — it's a strict superset of DUB_LANGUAGES.
//
// This replaces a private LANG_MAP that lived inside lib/autoclip-dub.ts and
// had drifted into a third, unreconciled language list (alongside this file's
// DUB_LANGUAGES and lib/i18n-locales.ts's UI locales). One list, one place.
export const CAPTION_LANGUAGES: { code: string; label: string }[] = [
  ...DUB_LANGUAGES,
  { code: "bg", label: "Bulgarian" }, { code: "hr", label: "Croatian" }, { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" }, { code: "fi", label: "Finnish" }, { code: "el", label: "Greek" },
  { code: "hu", label: "Hungarian" }, { code: "ms", label: "Malay" }, { code: "ro", label: "Romanian" },
  { code: "sk", label: "Slovak" }, { code: "sv", label: "Swedish" }, { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" }, { code: "bn", label: "Bengali" }, { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" }, { code: "mr", label: "Marathi" },
].sort((a, b) => a.label.localeCompare(b.label));

/** English name for a language code, for prompting. Falls back to the code. */
export function captionLanguageName(code: string): string {
  return CAPTION_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
