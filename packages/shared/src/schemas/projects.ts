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

// ── Mobile API (/api/mobile/v1/projects, /clips) ───────────────────────────

/**
 * GET /projects?q=&sort=&drafts=1&cursor= — started AutoClip runs and editor
 * projects. `total` counts every match, not just this page.
 */
export const projectsPageSchema = z.object({ projects: z.array(projectSummarySchema), nextCursor: z.string().nullable(), total: z.number().int().nonnegative() });
export const projectSortSchema = z.enum(["recent", "oldest", "name", "clips"]);
export type ProjectListOptions = { q?: string; sort?: ProjectSort; drafts?: boolean; cursor?: string | null };
/** GET /clips?aspect=&favorites=1&q=&cursor= — newest first. */
export const clipsPageSchema = z.object({ clips: z.array(clipSchema), nextCursor: z.string().nullable(), total: z.number().int().nonnegative() });
export type ClipListOptions = { aspect?: ClipAspect | null; favorites?: boolean; q?: string; cursor?: string | null };

/** POST /projects/delete, /clips/delete — several at once (the multi-select screens). */
export const MAX_BULK = 50;
export const bulkDeleteRequest = z.object({ ids: z.array(z.string().min(1)).min(1, "Pick something to delete").max(MAX_BULK, `Delete up to ${MAX_BULK} at a time`) });
/** `skipped`: clips still rendering, captioning or dubbing, which can't be deleted yet. */
export const bulkDeleteResponse = z.object({ deleted: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() });
export type BulkDeleteResult = z.infer<typeof bulkDeleteResponse>;

/** What a clip's virality score is made of (lib/virality-score.ts), each 0–99 like the score. */
export const scoreBreakdownSchema = z.object({
  hook: z.number(),
  pacing: z.number(),
  payoff: z.number(),
  engagement: z.number(),
  audio: z.number(),
  speechRate: z.number(),
  silence: z.number(),
});
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;

/** GET /clips/:id */
export const clipDetailSchema = clipSchema.extend({
  projectTitle: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  /** Signed, short-lived; null until the clip is ready. */
  videoUrl: z.string().nullable(),
  breakdown: scoreBreakdownSchema.nullable(),
  /** The AI's reason for picking this moment, and what makes its opening work. */
  reasoning: z.string().nullable(),
  hookExplanation: z.string().nullable(),
});
export type ClipDetail = z.infer<typeof clipDetailSchema>;

export const renameRequest = z.object({ title: z.string().trim().min(1, "Give it a name").max(200, "Keep it under 200 characters") });
/** PATCH /clips/:id */
export const clipPatchRequest = z
  .object({ title: z.string().trim().min(1).max(200).optional(), favorite: z.boolean().optional() })
  .refine((v) => v.title !== undefined || v.favorite !== undefined, { message: "Nothing to change" });

/** GET /clips/:id/download — a signed link to save the MP4. */
export const downloadLinkSchema = z.object({ url: z.string(), fileName: z.string(), expiresAt: z.string() });
export type DownloadLink = z.infer<typeof downloadLinkSchema>;
