import { prisma } from "@/lib/prisma";

// An AutoClip run's render progress lives on its Clip rows — renderClip writes
// Clip.progress as each clip encodes — and nothing ever writes it back to
// Project.progress. So every surface that showed `project.progress` for a
// rendering run (Home's "Continue" cards, the projects grid, the mobile app)
// read a column frozen at 0: "Rendering 0%" for the whole render.
//
// Derived at read time instead of mirrored on write: renders run clips
// concurrently, and a per-tick project write would race itself and bump
// Project.updatedAt on every ffmpeg progress line.

type ClipProgress = { status: string; progress: number };

/** One run's progress, 0-100: a finished clip (ready or failed) counts as done. */
export function runProgress(clips: ClipProgress[]): number {
  if (clips.length === 0) return 0;
  const sum = clips.reduce(
    (s, c) => s + (c.status === "ready" || c.status === "failed" ? 100 : Math.max(0, Math.min(100, c.progress))),
    0,
  );
  return Math.round(sum / clips.length);
}

/** Project id → derived progress, for the given rendering projects. */
export async function runProgressByProject(projectIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (projectIds.length === 0) return out;
  const clips = await prisma.clip.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, status: true, progress: true },
  });
  const byProject = new Map<string, ClipProgress[]>();
  for (const c of clips) {
    const list = byProject.get(c.projectId) ?? [];
    list.push(c);
    byProject.set(c.projectId, list);
  }
  for (const id of projectIds) out.set(id, runProgress(byProject.get(id) ?? []));
  return out;
}

/**
 * Replaces `progress` on every rendering row with its clips' progress. Rows in
 * any other status keep the stored value. AutoClip only: an editor export has
 * no clips and does write Project.progress itself.
 */
export async function withRunProgress<T extends { id: string; status: string; progress: number; productType?: string }>(
  rows: T[],
): Promise<T[]> {
  const ids = rows
    .filter((r) => r.status === "rendering" && r.productType !== "editor")
    .map((r) => r.id);
  if (ids.length === 0) return rows;
  const progress = await runProgressByProject(ids);
  return rows.map((r) => (progress.has(r.id) ? { ...r, progress: progress.get(r.id)! } : r));
}
