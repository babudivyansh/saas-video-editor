import { Prisma } from "@prisma/client";

// One definition of "is this project real work, or an empty shell the app
// created on the user's behalf?", shared by the dashboard resume rail and the
// empty-draft sweep so the two can never disagree about what counts.
//
// Why this is needed: projects used to be created before the user did
// anything — opening /dashboard/editor POSTed a "Untitled project" draft on
// page load, and a failed Auto Clip import left its draft behind. Those rows
// were indistinguishable from real work in every query, so they filled the
// "Continue where you left off" rail and inflated the "Active projects" tile
// forever. Creation is fixed at the source now; this predicate is what keeps
// any that still slip through (or already exist) out of the UI.

export const ACTIVE_STATUSES = ["draft", "analyzing", "pending_review", "rendering"];

/** Product types the dashboard can actually resume the user into. */
export const RESUMABLE_PRODUCT_TYPES = ["auto-clip", "editor"];

// Reaching any of these means the pipeline already claimed the project, so
// work demonstrably started regardless of what the row currently holds.
const STARTED_STATUSES = ["analyzing", "pending_review", "rendering"];

/**
 * Signs that a project holds real work. Expressed positively (rather than as
 * NOT-empty) because it reads better and avoids negating a JSON-null filter.
 *
 * Note `editorDoc` uses `Prisma.AnyNull`: a fresh row leaves the column SQL
 * NULL (DbNull), but a client can also store a JSON `null` (JsonNull), and
 * only AnyNull covers both.
 */
export const STARTED_SIGNALS: Prisma.ProjectWhereInput[] = [
  { status: { in: STARTED_STATUSES } },
  { clips: { some: {} } },
  { editorDoc: { not: Prisma.AnyNull } },
  { uploadedVideoUrl: { not: null } },
  { videoUrl: { not: null } },
];

/**
 * Active, resumable projects the user actually started — the population behind
 * both the "Active projects" tile and the cards under it. Previously the tile
 * counted every product type with no started-check while the cards filtered to
 * two types, which is why a user could see "15 active" above five cards.
 */
export function startedResumableWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    userId,
    status: { in: ACTIVE_STATUSES },
    productType: { in: RESUMABLE_PRODUCT_TYPES },
    OR: STARTED_SIGNALS,
  };
}

/**
 * The inverse, for the sweep: a draft carrying no sign of work at all. Callers
 * add their own age cutoff — this half is deliberately about emptiness only.
 */
export function emptyDraftWhere(userId?: string): Prisma.ProjectWhereInput {
  return {
    ...(userId ? { userId } : {}),
    status: "draft",
    NOT: { OR: STARTED_SIGNALS },
  };
}
