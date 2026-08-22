// Classifies a render-job failure into a short, safe, user-facing reason.
//
// Every render failure must be diagnosable by engineering (full error +
// stack goes to logger.error -> Sentry) without ever showing the end user
// raw internals (stack traces, file paths, S3 keys, provider error bodies).
// This is the single place that decides what a project owner is allowed to
// see about why their export failed — keep it pattern-matching on error
// *shape*, never echoing the error's own message text back to the client.

export type RenderFailureCategory =
  | "missing_resource"
  | "encoding_failed"
  | "timeout"
  | "download_failed"
  | "invalid_document"
  | "unknown";

export interface RenderFailureClassification {
  category: RenderFailureCategory;
  /** Safe to persist to Project.failureReason and show the project owner. */
  userMessage: string;
}

const RULES: { test: RegExp; category: RenderFailureCategory; userMessage: string }[] = [
  {
    test: /No usable font file found/i,
    category: "missing_resource",
    userMessage: "A required font resource is missing on our render server. Our team has been notified — please try again shortly.",
  },
  {
    test: /timed out/i,
    category: "timeout",
    userMessage: "Rendering took too long and was stopped. Try a shorter project or fewer effects, then export again.",
  },
  {
    test: /FFmpeg exited|Error when evaluating|ffmpeg could not/i,
    category: "encoding_failed",
    userMessage: "Video encoding failed. Please try exporting again — if this keeps happening, contact support.",
  },
  {
    test: /download|ENOTFOUND|ECONNREFUSED|ECONNRESET|status \d{3}/i,
    category: "download_failed",
    userMessage: "We couldn't download one of your media files. Please try again.",
  },
  {
    test: /has no editor document|Invalid timeline|invalid aspect|unsupported version/i,
    category: "invalid_document",
    userMessage: "Your project data looks invalid. Make a small edit and save, then try exporting again.",
  },
];

const FALLBACK: RenderFailureClassification = {
  category: "unknown",
  userMessage: "An unexpected error occurred while rendering. Please try again — if this keeps happening, contact support.",
};

/** Pure, testable: never throws, never echoes the raw error message to the caller. */
export function classifyRenderFailure(err: unknown): RenderFailureClassification {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const rule of RULES) {
    if (rule.test.test(message)) return { category: rule.category, userMessage: rule.userMessage };
  }
  return FALLBACK;
}
