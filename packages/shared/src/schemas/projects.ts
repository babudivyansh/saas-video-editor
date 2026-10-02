import { z } from "zod";

// Projects tab. Shapes follow the web's Project / Clip rows (prisma/schema.prisma)
// so Phase 5's /api/mobile/v1/projects and /clips can return them directly.

export const projectKindSchema = z.enum(["autoclip", "editor"]);
/** Project.status on the web. */
export const projectStatusSchema = z.enum(["draft", "processing", "rendering", "completed", "failed"]);
/** Clip.status on the web. */
export const clipStatusSchema = z.enum(["queued", "rendering", "ready", "failed"]);
export const clipAspectSchema = z.enum(["9:16", "16:9", "1:1"]);
export type ClipAspect = z.infer<typeof clipAspectSchema>;

/**
 * Editing checklist behind a draft's progress: each step done = 20%.
 * New backend work (decided 2026-10-01: "build it and flag it") — Phase 5
 * computes it server-side from the editor doc.
 */
export const DRAFT_STEPS = ["media", "trim", "captions", "audio", "text"] as const;
export const draftStepSchema = z.enum(DRAFT_STEPS);
export const draftProgress = (done: readonly string[]) => Math.round((new Set(done.filter((d) => (DRAFT_STEPS as readonly string[]).includes(d))).size / DRAFT_STEPS.length) * 100);

export const projectSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: projectKindSchema,
  status: projectStatusSchema,
  aspect: clipAspectSchema,
  thumbnailUrl: z.string(),
  clipCount: z.number().int().nonnegative(),
  /** Seconds of the edit (drafts) or the source video. */
  durationSec: z.number().nonnegative(),
  updatedAt: z.string(),
  /** Drafts only: finished checklist steps. */
  draftSteps: z.array(draftStepSchema).optional(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const clipSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  /** Generation order, 1-based ("#1"). */
  rank: z.number().int().positive(),
  title: z.string(),
  /** Virality 0–99 (lib/virality-score.ts); null until scored. */
  score: z.number().int().min(0).max(99).nullable(),
  durationSec: z.number().nonnegative(),
  aspect: clipAspectSchema,
  status: clipStatusSchema,
  thumbnailUrl: z.string(),
  favorite: z.boolean(),
  failureReason: z.string().nullable(),
});
export type Clip = z.infer<typeof clipSchema>;

export const projectDetailSchema = projectSummarySchema.extend({ clips: z.array(clipSchema) });
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/** Projects-tab filter chips (decision 2026-10-02 A: shapes, not platforms). */
export const PROJECT_FILTERS = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts" },
  { id: "vertical", label: "Shorts & Reels" },
  { id: "wide", label: "Videos" },
  { id: "square", label: "Square" },
] as const;
export type ProjectFilter = (typeof PROJECT_FILTERS)[number]["id"];
export const FILTER_ASPECT: Partial<Record<ProjectFilter, ClipAspect>> = { vertical: "9:16", wide: "16:9", square: "1:1" };

export const PROJECT_SORTS = [
  { id: "recent", label: "Recent" },
  { id: "oldest", label: "Oldest" },
  { id: "name", label: "Name" },
  { id: "clips", label: "Most clips" },
] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number]["id"];

export function sortProjects<T extends ProjectSummary>(list: T[], sort: ProjectSort): T[] {
  const by: Record<ProjectSort, (a: T, b: T) => number> = {
    recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    oldest: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
    name: (a, b) => a.title.localeCompare(b.title),
    clips: (a, b) => b.clipCount - a.clipCount,
  };
  return [...list].sort(by[sort]);
}

/** Score-spread buckets, best first. */
export const SCORE_BUCKETS = [
  { label: "90+", min: 90 },
  { label: "80s", min: 80 },
  { label: "70s", min: 70 },
  { label: "60s", min: 60 },
  { label: "<60", min: 0 },
] as const;
export function scoreSpread(clips: Pick<Clip, "score">[]): number[] {
  const counts = SCORE_BUCKETS.map(() => 0);
  for (const c of clips) {
    if (c.score == null) continue;
    const i = SCORE_BUCKETS.findIndex((b) => c.score! >= b.min);
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}
