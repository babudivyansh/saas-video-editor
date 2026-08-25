// Classifies a one-shot project render failure (Split Screen, Streamer Video)
// into a short, safe, user-facing reason.
//
// The sibling of lib/editor/render-failure.ts, lib/caption-failure.ts and
// lib/autoclip-failure.ts — same contract, this surface's wording. Shared by
// both pipelines because they are the same shape: download the project's
// source video, run one FFmpeg pass, upload the result.
//
// Sanitizing is mandatory, not cosmetic. utils/download.ts builds its error as
// `Download failed: HTTP 403 for ${url}` — the FULL presigned URL, signature
// included. Persisting a raw error to Project.failureReason would publish an
// AWS signature to the project owner's UI. Match on error *shape*; never echo
// the message text back.

export type ProjectRenderFailureCategory =
  | "source_expired"
  | "source_missing"
  | "source_download_failed"
  | "render_failed"
  | "storage_failed"
  | "unknown_failure";

export interface ProjectRenderFailureClassification {
  category: ProjectRenderFailureCategory;
  /** Safe to persist to Project.failureReason and show the project owner. */
  userMessage: string;
}

// Order matters: downloadFile's message contains BOTH "Download" and the
// status code, so the specific status rules must be tested before the generic
// download rule or every 403/404 would collapse into source_download_failed.
const RULES: { test: RegExp; category: ProjectRenderFailureCategory; userMessage: string }[] = [
  {
    // The stale-presigned-URL signature: a source URL outlived its 6h window.
    // After the shared resolver this should only be reachable when ownership
    // could not be proven, so it is a real operator signal, not noise.
    test: /Request has expired|AccessDenied|\b40[13]\b/i,
    category: "source_expired",
    userMessage: "We couldn't access this project's original video. Please re-upload it and try again.",
  },
  {
    test: /\b404\b|NoSuchKey|missing uploadedVideoUrl|has no uploaded/i,
    category: "source_missing",
    userMessage: "This project's video is no longer available. Please re-upload it and try again.",
  },
  {
    test: /download|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timed out/i,
    category: "source_download_failed",
    userMessage: "We couldn't download this project's video. Please try again.",
  },
  {
    test: /FFmpeg exited|No such filter|Error when evaluating|No usable font|encoder/i,
    category: "render_failed",
    userMessage: "Rendering failed for this video. Please try again — if this keeps happening, contact support.",
  },
  {
    test: /S3|upload failed|PutObject|NoSuchBucket/i,
    category: "storage_failed",
    userMessage: "We couldn't save the finished video. Please try again.",
  },
];

const FALLBACK: ProjectRenderFailureClassification = {
  category: "unknown_failure",
  userMessage: "Something went wrong while rendering this video. Please try again — if this keeps happening, contact support.",
};

/** Pure, testable: never throws, never echoes the raw error message to the caller. */
export function classifyProjectRenderFailure(err: unknown): ProjectRenderFailureClassification {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const rule of RULES) {
    if (rule.test.test(message)) return { category: rule.category, userMessage: rule.userMessage };
  }
  return FALLBACK;
}
