// Runs an AutoClip link import in the background and tracks its progress.
//
// CLIPIRO-WEB-15: POST /api/projects/[id]/import-url downloaded the whole
// source (yt-dlp, then an S3 upload) inside the HTTP request. A long Twitch or
// YouTube VOD takes minutes, longer than the connection survives behind the
// hosting proxy, so the browser saw a failed request while the server kept
// going. The browser then discarded the draft project (the right call for a
// failed import), and when the server finished it uploaded the file to S3 and
// tried to `project.update` a row that no longer existed: P2025 in Sentry, an
// orphaned upload in the bucket, and an import that had failed for the user.
//
// The web client now starts the import (202) and polls its status. Finishing
// is race-safe either way: the project is updated only if it still exists and
// is still the user's draft; otherwise the upload is deleted.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { importSourceFromUrl, UrlImportError, type UrlImportResult } from "@/lib/url-import";
import { adoptExistingS3Object } from "@/lib/asset-service";
import { deleteS3Object } from "@/utils/s3-upload";
import type { TierId } from "@/lib/plans/tiers";

export type UrlImportState =
  | { state: "running"; userId: string; startedAt: number }
  | { state: "done"; userId: string; url: string; title: string; durationSec: number; bytes: number }
  | { state: "failed"; userId: string; error: string };

/** How long a finished state stays readable. */
const STATE_TTL_SEC = 6 * 60 * 60;
/**
 * A "running" state older than this belongs to an import whose process died
 * (a deploy restart); the poller must not spin on it forever. Downloads are
 * capped by plan duration and size, so a live one never gets close.
 */
export const IMPORT_STALE_MS = 60 * 60 * 1000;

export const PROJECT_GONE_MESSAGE = "This project was deleted before the import finished.";
const GENERIC_FAILURE = "Import failed — please try again";

const stateKey = (projectId: string) => `url-import:${projectId}`;

async function writeState(projectId: string, s: UrlImportState): Promise<void> {
  await redis.set(stateKey(projectId), JSON.stringify(s), "EX", STATE_TTL_SEC);
}

export async function getUrlImportState(projectId: string): Promise<UrlImportState | null> {
  const raw = await redis.get(stateKey(projectId));
  if (!raw) return null;
  let s: UrlImportState;
  try {
    s = JSON.parse(raw) as UrlImportState;
  } catch {
    return null;
  }
  if (s.state === "running" && Date.now() - s.startedAt > IMPORT_STALE_MS) {
    return { state: "failed", userId: s.userId, error: "The import was interrupted. Please try again." };
  }
  return s;
}

/**
 * Points the project at the imported file. Returns false (and deletes the
 * upload) when the project was deleted or left draft while downloading.
 */
export async function finishUrlImport(projectId: string, userId: string, result: UrlImportResult): Promise<boolean> {
  const { count } = await prisma.project.updateMany({
    where: { id: projectId, userId, status: "draft" },
    data: { uploadedVideoUrl: result.url, title: result.title },
  });
  if (count === 0) {
    logger.warn("url-import", "project gone before the import finished; deleting the upload", { projectId });
    await deleteS3Object(result.key).catch((e) => {
      logger.warn("url-import", "could not delete the orphaned upload", { key: result.key, reason: (e as Error).message });
    });
    return false;
  }

  // Global Asset Library: a URL-imported source is a genuine user input, same
  // as an uploaded file. Best-effort: the project already has its source, so
  // an adoption failure costs provenance, never the import.
  adoptExistingS3Object({
    userId,
    s3Key: result.key,
    mimeType: "video/mp4",
    name: result.title,
    size: result.bytes,
    duration: result.durationSec,
    sourceFeature: "url-import",
    sourceProjectId: projectId,
  })
    .then(({ asset }) =>
      prisma.project.updateMany({ where: { id: projectId, userId }, data: { sourceAssetId: asset.id } }),
    )
    .catch((e) => {
      logger.warn("url-import", "best-effort asset adoption failed", { reason: (e as Error).message, projectId });
    });
  return true;
}

/** Message for the user plus whether the failure is ours (worth paging). */
export function describeImportFailure(err: unknown): { message: string; unexpected: boolean } {
  if (err instanceof UrlImportError) return { message: err.message, unexpected: false };
  return { message: GENERIC_FAILURE, unexpected: true };
}

/**
 * Starts the import without waiting for it. Returns false when one is already
 * running for this project (a double click, a retried request).
 */
export async function startUrlImport(args: { url: string; userId: string; projectId: string; tier: TierId }): Promise<boolean> {
  const { projectId, userId } = args;
  const current = await getUrlImportState(projectId);
  if (current?.state === "running") return false;
  await writeState(projectId, { state: "running", userId, startedAt: Date.now() });

  void (async () => {
    try {
      const result = await importSourceFromUrl(args);
      const kept = await finishUrlImport(projectId, userId, result);
      await writeState(
        projectId,
        kept
          ? { state: "done", userId, url: result.url, title: result.title, durationSec: result.durationSec, bytes: result.bytes }
          : { state: "failed", userId, error: PROJECT_GONE_MESSAGE },
      );
    } catch (err) {
      const { message, unexpected } = describeImportFailure(err);
      if (unexpected) logger.error("url-import", `import failed for project ${projectId}`, err);
      await writeState(projectId, { state: "failed", userId, error: message }).catch(() => {});
    }
  })();
  return true;
}
