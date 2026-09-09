// What a caption render is rendering, and where the result goes.
//
// A CaptionRenderJob used to be able to own exactly one thing: a Clip. Every
// step of lib/caption-render-job.ts reached through `job.clip` — for the source
// URL, the duration, the transcript, the S3 prefix, the asset name, the
// ownership check, and the final write-back. That was fine while AutoClip was
// the only surface with a finished video to caption.
//
// reddit-video, split-screen and streamer-video have no Clip row at all: their
// finished video hangs off Project. Rather than branch on `job.clipId` in eight
// places — where the branch that matters is the OWNERSHIP one, and a mistake is
// cross-tenant data access rather than a wrong-looking caption — every one of
// those reads goes through this single resolver.
//
// The provider layer needs no notion of any of this: CaptionRenderInput was
// already sourceUrl + template + language + duration.

import { prisma } from "@/lib/prisma";
import { s3KeyToPublicUrl } from "@/utils/s3-upload";
import type { WordTiming } from "@/utils/elevenlabs";
import type { Prisma } from "@prisma/client";
import type { SourceFeature } from "@/lib/asset-service";

export type RenderOwnerType = "clip" | "project";

export interface RenderOwnerRef {
  type: RenderOwnerType;
  id: string;
}

export interface RenderSource {
  owner: RenderOwnerRef;
  /** The authority for every access check. Never re-derived from a relation. */
  userId: string;
  /** For the S3 prefix and the queue payload. */
  projectId: string;
  /** Stored URL of the finished video to caption. Null when there isn't one. */
  videoUrl: string | null;
  durationSec: number;
  /** Used for the Asset name only. */
  title: string;
  /** True when the video is finished and safe to hand to a provider. */
  ready: boolean;
  /** Clipiro's canonical transcript. Empty when the owner has none yet. */
  transcript: WordTiming[];
  /** Asset provenance for the ingested result. */
  sourceFeature: SourceFeature;
  sourceClipId?: string;
}

type JobOwner = { id: string; clipId: string | null; projectId: string | null; userId: string | null };

/**
 * Resolves a job's owner, scoped to a user when one is given.
 *
 * Pass `userId` for anything reached from a request — it becomes the WHERE
 * clause, so a job belonging to someone else resolves to null rather than to a
 * row the caller then has to remember to check. Omit it only in workers, which
 * are acting on a job that was already authorised when it was created.
 */
export async function resolveRenderSource(
  job: JobOwner,
  opts: { userId?: string } = {},
): Promise<RenderSource | null> {
  if (job.clipId) {
    const clip = await prisma.clip.findFirst({
      where: {
        id: job.clipId,
        ...(opts.userId ? { project: { userId: opts.userId } } : {}),
      },
      include: { project: { select: { userId: true } } },
    });
    if (!clip) return null;
    return {
      owner: { type: "clip", id: clip.id },
      userId: clip.project.userId,
      projectId: clip.projectId,
      videoUrl: clip.videoUrl,
      durationSec: clip.durationSec,
      title: clip.title ?? "Clip",
      ready: clip.status === "ready" && Boolean(clip.videoUrl),
      transcript: (clip.transcriptJson as unknown as WordTiming[] | null) ?? [],
      sourceFeature: "autoclip",
      sourceClipId: clip.id,
    };
  }

  if (job.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: job.projectId, ...(opts.userId ? { userId: opts.userId } : {}) },
    });
    if (!project) return null;
    return {
      owner: { type: "project", id: project.id },
      userId: project.userId,
      projectId: project.id,
      videoUrl: project.videoUrl,
      // These products don't store a duration; the caller passes the probed one
      // in at request time and it is persisted on the job as sourceDurationSec.
      durationSec: 0,
      title: project.title || "Video",
      ready: project.status === "completed" && Boolean(project.videoUrl),
      transcript: (project.captionsJson as unknown as WordTiming[] | null) ?? [],
      // The Asset library's provenance vocabulary has no per-product value
      // for these three; "video-generator" is the bucket they already share.
      sourceFeature: "video-generator",
      };
  }

  // Neither owner set. Only reachable from a hand-edited row; treated as a
  // missing job rather than crashing a worker.
  return null;
}

/** Points the owner at the captioned render. The last step of a paid job. */
export async function applyRenderResult(job: JobOwner, s3Key: string): Promise<void> {
  const url = s3KeyToPublicUrl(s3Key);
  if (job.clipId) {
    await prisma.clip.update({ where: { id: job.clipId }, data: { videoUrl: url, hasCaptions: true } });
    return;
  }
  if (job.projectId) {
    await prisma.project.update({ where: { id: job.projectId }, data: { videoUrl: url } });
  }
}

/**
 * Stores a transcript we did not already have.
 *
 * Only ever called when the owner's transcript is empty — Clipiro's stays
 * canonical, and a user's corrections are never overwritten by the provider's.
 */
export async function adoptTranscript(job: JobOwner, words: WordTiming[]): Promise<void> {
  const value = words as unknown as Prisma.InputJsonValue;
  if (job.clipId) {
    await prisma.clip.update({ where: { id: job.clipId }, data: { transcriptJson: value } });
    return;
  }
  if (job.projectId) {
    await prisma.project.update({ where: { id: job.projectId }, data: { captionsJson: value } });
  }
}

/**
 * A Prisma WHERE matching one job this user owns, whichever owner it has.
 *
 * Deliberately still goes through the RELATION rather than the job's own
 * userId column — that column exists so a refund works without the enqueue
 * payload, and using it for authorisation would make a stale copy of ownership
 * load-bearing. The clip branch is exactly the check that shipped before; the
 * project branch is the new owner kind, not a relaxation of the old one.
 */
export function ownedJobWhere(jobId: string, userId: string): Prisma.CaptionRenderJobWhereInput {
  return {
    id: jobId,
    OR: [{ clip: { project: { userId } } }, { project: { userId } }],
  };
}

/** The ledger refId. Owner-typed, or a clip and a project could collide. */
export function renderRefId(owner: RenderOwnerRef, revision: number): string {
  return owner.type === "clip"
    ? `caption-render:${owner.id}:${revision}`
    : `caption-render:project:${owner.id}:${revision}`;
}
