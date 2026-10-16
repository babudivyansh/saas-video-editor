// Version history for manual-editor projects. The project PATCH calls
// snapshotDoc() with the doc it is about to replace; while someone edits, at
// most one snapshot per SNAPSHOT_EVERY_MS is kept (autosave runs every few
// seconds), but an overwrite ("keep my version") or a restore always keeps
// one, so the copy being replaced can always be brought back. Oldest beyond
// MAX_VERSIONS are dropped. Server-only.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { docDuration } from "@/lib/editor/doc-utils";
import type { TimelineDoc } from "@/lib/editor/types";

export const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;
export const MAX_VERSIONS = 30;

export type SnapshotReason = "autosave" | "overwrite" | "restore" | "conflict";

export function summarizeDoc(doc: TimelineDoc): { clipCount: number; durationSec: number } {
  const tracks = doc.tracks ?? {};
  const clipCount = Object.values(tracks).reduce((n, t) => n + (Array.isArray(t) ? t.length : 0), 0);
  let durationSec = 0;
  try {
    durationSec = Math.round(docDuration(doc) * 100) / 100;
  } catch {
    durationSec = 0;
  }
  return { clipCount, durationSec };
}

function isEmptyDoc(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return true;
  const tracks = (doc as { tracks?: Record<string, unknown> }).tracks;
  if (!tracks || typeof tracks !== "object") return true;
  return Object.values(tracks).every((t) => !Array.isArray(t) || t.length === 0);
}

/**
 * Keeps `doc` (the editorDoc at `version`) in the project's history. Returns
 * whether a snapshot was written. Never throws — history must not fail a save.
 */
export async function snapshotDoc(projectId: string, doc: unknown, version: number, reason: SnapshotReason): Promise<boolean> {
  try {
    if (isEmptyDoc(doc)) return false;
    if (reason === "autosave") {
      const latest = await prisma.projectVersion.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < SNAPSHOT_EVERY_MS) return false;
    }
    const { clipCount, durationSec } = summarizeDoc(doc as TimelineDoc);
    await prisma.projectVersion.create({
      data: { projectId, version, doc: doc as object, reason, clipCount, durationSec },
    });
    const stale = await prisma.projectVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      skip: MAX_VERSIONS,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.projectVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
    }
    return true;
  } catch (err) {
    logger.warn("project-versions", "snapshot failed", { projectId, reason: (err as Error).message });
    return false;
  }
}
