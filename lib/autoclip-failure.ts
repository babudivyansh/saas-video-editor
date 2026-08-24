// Classifies an AutoClip pipeline failure into a short, safe, user-facing
// reason — the AutoClip counterpart of lib/editor/render-failure.ts and
// lib/caption-failure.ts.
//
// P0-3: a failed AutoClip re-render recorded `failureReason: null`, so a
// production P0 was invisible to both the user and whoever had to diagnose it.
// The raw error can carry a presigned S3 URL (signature included), a provider
// error body, or a local temp path, so it must never be surfaced verbatim.

export type AutoClipFailureCategory =
  | "source_expired"
  | "source_download_failed"
  | "probe_failed"
  | "transcription_failed"
  | "render_failed"
  | "storage_failed"
  | "unknown_pipeline_failure";

export interface AutoClipFailureClassification {
  category: AutoClipFailureCategory;
  /** Safe to persist on the project and show its owner. */
  userMessage: string;
}

const RULES: { test: RegExp; category: AutoClipFailureCategory; userMessage: string }[] = [
  {
    // The P0-3 signature: a presigned source URL outlived its 6-hour window.
    test: /Request has expired|AccessDenied|\b403\b/i,
    category: "source_expired",
    userMessage: "We couldn't access this project's original video. Please re-upload it and try again.",
  },
  {
    test: /download|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|\b404\b/i,
    category: "source_download_failed",
    userMessage: "We couldn't download this project's video. Please try again.",
  },
  {
    test: /probe|duration could not|no video stream/i,
    category: "probe_failed",
    userMessage: "We couldn't read this video file. It may be corrupt or in an unsupported format.",
  },
  {
    test: /transcri|speech-to-text|scribe|whisper/i,
    category: "transcription_failed",
    userMessage: "We couldn't transcribe this video's audio. Please try again shortly.",
  },
  {
    test: /FFmpeg exited|No such filter|Error when evaluating|encoder/i,
    category: "render_failed",
    userMessage: "Rendering failed for this clip. Please try again — if this keeps happening, contact support.",
  },
  {
    test: /S3|upload failed|PutObject|NoSuchBucket/i,
    category: "storage_failed",
    userMessage: "We couldn't save the finished clip. Please try again.",
  },
];

const FALLBACK: AutoClipFailureClassification = {
  category: "unknown_pipeline_failure",
  userMessage: "Something went wrong while processing this clip. Please try again — if this keeps happening, contact support.",
};

/** Pure, testable: never throws, never echoes the raw error to the caller. */
export function classifyAutoClipFailure(err: unknown): AutoClipFailureClassification {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const rule of RULES) {
    if (rule.test.test(message)) return { category: rule.category, userMessage: rule.userMessage };
  }
  return FALLBACK;
}
