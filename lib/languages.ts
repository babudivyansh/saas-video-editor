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
