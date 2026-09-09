// Wire shape for CaptionRenderJob.
//
// Same role as lib/asset-serialize.ts: a single place that decides what leaves
// the server, so a column added later isn't accidentally exposed by a route
// that spreads the row.
//
// Four fields are deliberately withheld:
//
//   providerProjectId  — the provider's own id. Exposing it tells the client
//                        which vendor renders their captions and would make the
//                        abstraction impossible to swap later (§36 "do not
//                        expose provider IDs unless needed"). Nothing in the UI
//                        needs it.
//   providerTemplate   — same reasoning: the user picked a Clipiro template
//                        slug, and that slug is what the UI speaks. Some labels
//                        read the same as the vendor's names by product choice,
//                        but the mapping itself stays server-side.
//   providerResponse   — raw vendor payloads, kept for support. May contain
//                        signed URLs and vendor-internal fields.
//   requestPayload     — what we sent, including internal feature toggles.
//
// providerCostMicroUsd and providerBillableSec are also withheld: users are
// billed in Clipiro credits and must never see provider pricing (§24).

import type { CaptionRenderJob } from "@prisma/client";

export interface SerializedCaptionRenderJob {
  id: string;
  /** Null when the render belongs to a whole project rather than a clip. */
  clipId: string | null;
  /** Set instead of clipId for the single-video products. */
  projectId: string | null;
  status: string;
  templateId: string;
  language: string;
  captionRevision: number;
  position: { x: number; y: number } | null;
  hookEnabled: boolean;
  creditsCharged: number | null;
  /** Clipiro's own asset, once ingested. Never a provider URL. */
  outputAssetId: string | null;
  /** Already mapped to a user-facing sentence — never raw provider text. */
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeCaptionRenderJob(job: CaptionRenderJob): SerializedCaptionRenderJob {
  return {
    id: job.id,
    clipId: job.clipId ?? null,
    projectId: job.projectId ?? null,
    status: job.status,
    templateId: job.templateId,
    language: job.language,
    captionRevision: job.captionRevision,
    position:
      job.captionPositionX != null && job.captionPositionY != null
        ? { x: job.captionPositionX, y: job.captionPositionY }
        : null,
    hookEnabled: job.hookEnabled,
    creditsCharged: job.actualCredits ?? job.estimatedCredits,
    outputAssetId: job.outputAssetId,
    failureMessage: job.failureMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
