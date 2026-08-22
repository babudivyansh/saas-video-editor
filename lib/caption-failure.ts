// Classifies a caption-generation (transcription) failure into a short, safe,
// user-facing reason — the captions counterpart of lib/editor/render-failure.ts.
//
// lib/transcription.ts's provider chain (ElevenLabs -> Whisper -> fal) already
// throws only the *first* provider's error once every configured provider has
// failed. That raw error (a third-party API's error body, e.g. ElevenLabs'
// `{"detail":{"type":"authentication_error",...}}`) must never reach the
// client verbatim — this is the one place that decides what a project owner
// is allowed to see about why transcription failed.

export type CaptionFailureCategory =
  | "provider_auth"
  | "provider_unavailable"
  | "no_speech"
  | "download_failed"
  | "unknown";

export interface CaptionFailureClassification {
  category: CaptionFailureCategory;
  /** Safe to return from the API and show the project owner. */
  userMessage: string;
}

const RULES: { test: RegExp; category: CaptionFailureCategory; userMessage: string }[] = [
  {
    test: /No speech detected/i,
    category: "no_speech",
    userMessage: "We couldn't detect any speech in this video, so no captions were generated.",
  },
  {
    test: /authentication_error|invalid_api_key|401|api_key/i,
    category: "provider_auth",
    userMessage: "Caption generation is temporarily unavailable. Our team has been notified — please try again shortly.",
  },
  {
    test: /download|ENOTFOUND|ECONNREFUSED|ECONNRESET/i,
    category: "download_failed",
    userMessage: "We couldn't access this video's audio. Please try again.",
  },
];

const FALLBACK: CaptionFailureClassification = {
  category: "provider_unavailable",
  userMessage: "Caption generation failed. Please try again — if this keeps happening, contact support.",
};

/** Pure, testable: never throws, never echoes the raw error message to the caller. */
export function classifyCaptionFailure(err: unknown): CaptionFailureClassification {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const rule of RULES) {
    if (rule.test.test(message)) return { category: rule.category, userMessage: rule.userMessage };
  }
  return FALLBACK;
}
