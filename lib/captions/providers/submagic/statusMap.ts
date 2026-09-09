// Provider status -> Clipiro status.
//
// Submagic's exact status vocabulary is UNVERIFIED (confirming it requires
// creating a paid project), so this mapper is deliberately defensive: it
// normalizes case/underscores, matches on a broad set of plausible names, and
// — critically — NEVER invents a terminal state from an unrecognized string.
// An unknown status keeps the job where it is rather than marking it completed
// or failed, so a vocabulary change on their side degrades to "still working"
// and the reconciliation sweep's stale timeout catches it.
//
// Context matters more than the string does. With autoRender=false a project
// goes through two separate "done" moments — done transcribing (ready for the
// user to edit) and done rendering (an MP4 exists) — and providers routinely
// spell both "completed". So the caller passes what phase we asked for, and
// the presence of an output URL is trusted over any status word.

import type { CaptionRenderStatus } from "../../types";

export interface StatusContext {
  /** True once we've triggered the final render (exportRender was called). */
  exportRequested: boolean;
  /** True when the payload carries a downloadable output URL. */
  hasOutput: boolean;
  /** Where the job currently sits, so an unknown status can hold position. */
  current: CaptionRenderStatus;
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const FAILED = new Set(["failed", "error", "errored", "cancelled", "canceled", "rejected"]);
const TRANSCRIBING = new Set([
  "transcribing", "processing", "pending", "queued", "in_progress", "in_queue", "analyzing", "uploading",
]);
const RENDERING = new Set(["rendering", "exporting", "render_queued", "encoding"]);
const DONE = new Set(["completed", "complete", "done", "ready", "succeeded", "success", "finished"]);

/**
 * Maps a raw provider status into Clipiro's vocabulary.
 *
 * Returns `null` when the status is unrecognized, which the adapter turns into
 * "keep the current status" — see the module comment for why that matters.
 */
export function mapProviderStatus(raw: string | undefined, ctx: StatusContext): CaptionRenderStatus | null {
  // An output URL is proof of a finished render regardless of what the status
  // string says — it's the only signal here that can't be a naming change.
  if (ctx.hasOutput) return "downloading";

  if (!raw) return null;
  const s = normalize(raw);

  if (FAILED.has(s)) return s === "cancelled" || s === "canceled" ? "cancelled" : "failed";
  if (RENDERING.has(s)) return "rendering";

  if (DONE.has(s)) {
    // "Done" before we asked for a render means done TRANSCRIBING — the point
    // of autoRender=false is that it now waits for the user.
    if (!ctx.exportRequested) return "ready_to_edit";
    // Done after we asked, but with no output URL yet: the render finished but
    // the URL hasn't been published. Hold at rendering; the sweep re-reads.
    return "rendering";
  }

  if (TRANSCRIBING.has(s)) return ctx.exportRequested ? "rendering" : "transcribing";

  return null;
}
