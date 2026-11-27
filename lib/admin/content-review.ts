import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { resignMediaUrl } from "@/lib/signed-media";
import { toByteCount } from "@/lib/asset-serialize";
import { deleteContent } from "@/lib/admin/content";
import { clipDeleteBlocker, deleteClipAndMedia } from "@/lib/clip-delete";

// Admin content review — every video/image a user puts on the platform, so an
// admin can actually WATCH it and approve or remove it. Two sources:
//   • uploads: library Assets the user brought in (upload, URL import, editor
//     exports…). Stock is excluded (not user content), and AutoClip renders
//     are excluded because the clip itself is reviewed below.
//   • clips:   every ready AutoClip clip.
// The automated scan (lib/asset-moderation.ts) only ever flags uploads; its
// "flagged" rows sort into their own tab and are hidden from the owner until
// an admin approves them. Review is after publication — nothing waits on it.

export type ReviewKind = "asset" | "clip";
export type ReviewFilter = "flagged" | "pending" | "reviewed";

export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  mediaKind: "video" | "image";
  title: string;
  detail: string;
  thumbnailUrl: string | null;
  moderationStatus: string | null;
  labels: Array<{ name: string; confidence: number }>;
  sizeBytes: number | null;
  durationSec: number | null;
  createdAt: string;
  reviewedAt: string | null;
  owner: { id: string; email: string };
}

const USER_UPLOAD_SOURCES_EXCLUDED = ["stock", "autoclip"];

function assetWhere(filter: ReviewFilter): Prisma.AssetWhereInput {
  if (filter === "flagged") return { moderationStatus: "flagged" };
  return {
    kind: { in: ["video", "image"] },
    sourceFeature: { notIn: USER_UPLOAD_SOURCES_EXCLUDED },
    archivedAt: null,
    status: "ready",
    moderationStatus: { not: "flagged" },
    adminReviewedAt: filter === "pending" ? null : { not: null },
  };
}

function clipWhere(filter: Exclude<ReviewFilter, "flagged">): Prisma.ClipWhereInput {
  return { status: "ready", videoUrl: { not: null }, adminReviewedAt: filter === "pending" ? null : { not: null } };
}

function readLabels(json: unknown): ReviewItem["labels"] {
  const labels = (json as { labels?: unknown } | null)?.labels;
  if (!Array.isArray(labels)) return [];
  return labels
    .filter((l): l is { name: string; confidence: number } => typeof l?.name === "string" && typeof l?.confidence === "number")
    .sort((a, b) => b.confidence - a.confidence);
}

export async function reviewCounts(): Promise<{ flagged: number; pendingAssets: number; pendingClips: number }> {
  const [flagged, pendingAssets, pendingClips] = await Promise.all([
    prisma.asset.count({ where: assetWhere("flagged") }),
    prisma.asset.count({ where: assetWhere("pending") }),
    prisma.clip.count({ where: clipWhere("pending") }),
  ]);
  return { flagged, pendingAssets, pendingClips };
}

export async function listReviewQueue(q: {
  kind: ReviewKind;
  filter: ReviewFilter;
  cursor?: string;
  limit?: number;
}): Promise<{ items: ReviewItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(q.limit ?? 24, 1), 60);
  // Oldest unreviewed first so the queue drains in order; reviewed = newest first.
  const order = q.filter === "reviewed" ? ("desc" as const) : ("asc" as const);
  const page = { take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) };

  let items: ReviewItem[];
  if (q.kind === "asset" || q.filter === "flagged") {
    const rows = await prisma.asset.findMany({
      where: assetWhere(q.filter),
      orderBy: [{ createdAt: q.filter === "flagged" ? "desc" : order }, { id: "asc" }],
      select: {
        id: true, name: true, kind: true, mimeType: true, size: true, duration: true, sourceFeature: true,
        thumbnailS3Key: true, moderationStatus: true, moderationLabels: true, createdAt: true, adminReviewedAt: true,
        user: { select: { id: true, email: true } },
      },
      ...page,
    });
    items = await Promise.all(
      rows.map(async (a) => ({
        id: a.id,
        kind: "asset" as const,
        mediaKind: a.kind === "image" ? ("image" as const) : ("video" as const),
        title: a.name,
        detail: `${a.sourceFeature} · ${a.mimeType}`,
        thumbnailUrl: a.thumbnailS3Key ? await getAssetReadUrl(a.thumbnailS3Key).catch(() => null) : null,
        moderationStatus: a.moderationStatus,
        labels: readLabels(a.moderationLabels),
        sizeBytes: toByteCount(a.size),
        durationSec: a.duration ?? null,
        createdAt: a.createdAt.toISOString(),
        reviewedAt: a.adminReviewedAt?.toISOString() ?? null,
        owner: a.user,
      })),
    );
  } else {
    const rows = await prisma.clip.findMany({
      where: clipWhere(q.filter),
      orderBy: [{ createdAt: order }, { id: "asc" }],
      select: {
        id: true, title: true, thumbnailUrl: true, durationSec: true, aspectRatio: true, createdAt: true, adminReviewedAt: true,
        project: { select: { id: true, title: true, user: { select: { id: true, email: true } } } },
      },
      ...page,
    });
    items = await Promise.all(
      rows.map(async (c) => ({
        id: c.id,
        kind: "clip" as const,
        mediaKind: "video" as const,
        title: c.title || "(untitled clip)",
        detail: `AutoClip · ${c.aspectRatio} · ${c.project.title || "untitled project"}`,
        thumbnailUrl: await resignMediaUrl(c.thumbnailUrl),
        moderationStatus: null,
        labels: [],
        sizeBytes: null,
        durationSec: c.durationSec,
        createdAt: c.createdAt.toISOString(),
        reviewedAt: c.adminReviewedAt?.toISOString() ?? null,
        owner: c.project.user,
      })),
    );
  }

  const hasMore = items.length > limit;
  if (hasMore) items = items.slice(0, limit);
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** A short-lived URL to play the item, plus its owner (for the audit row). Null when it's gone. */
export async function reviewMedia(kind: ReviewKind, id: string): Promise<{ url: string; mimeType: string; ownerId: string } | null> {
  if (kind === "asset") {
    const a = await prisma.asset.findUnique({ where: { id }, select: { s3Key: true, mimeType: true, userId: true } });
    if (!a) return null;
    return { url: await getAssetReadUrl(a.s3Key, 3600), mimeType: a.mimeType, ownerId: a.userId };
  }
  const c = await prisma.clip.findUnique({ where: { id }, select: { videoUrl: true, project: { select: { userId: true } } } });
  if (!c?.videoUrl) return null;
  // Clip.videoUrl is server-written (the render worker), so re-signing it is safe.
  const url = await resignMediaUrl(c.videoUrl);
  return url ? { url, mimeType: "video/mp4", ownerId: c.project.userId } : null;
}

export type ReviewOutcome =
  | { ok: true; ownerId: string; before: Record<string, unknown> }
  | { ok: false; status: 404 | 409; error: string };

export async function applyReview(kind: ReviewKind, id: string, action: "approve" | "remove", adminId: string): Promise<ReviewOutcome> {
  if (kind === "asset") {
    const a = await prisma.asset.findUnique({ where: { id }, select: { userId: true, name: true, moderationStatus: true } });
    if (!a) return { ok: false, status: 404, error: "Upload not found" };
    if (action === "approve") {
      await prisma.asset.update({
        where: { id },
        // Approving a flagged upload also returns it to its owner's library.
        data: { adminReviewedAt: new Date(), adminReviewedById: adminId, ...(a.moderationStatus === "flagged" ? { moderationStatus: "clean" } : {}) },
      });
    } else {
      await deleteContent("asset", [id]);
    }
    return { ok: true, ownerId: a.userId, before: { name: a.name, moderationStatus: a.moderationStatus } };
  }

  const c = await prisma.clip.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, videoUrl: true, thumbnailUrl: true, project: { select: { userId: true } } },
  });
  if (!c) return { ok: false, status: 404, error: "Clip not found" };
  if (action === "approve") {
    await prisma.clip.update({ where: { id }, data: { adminReviewedAt: new Date(), adminReviewedById: adminId } });
  } else {
    const blocker = await clipDeleteBlocker(c);
    if (blocker) return { ok: false, status: 409, error: blocker };
    await deleteClipAndMedia(c, c.project.userId);
  }
  return { ok: true, ownerId: c.project.userId, before: { title: c.title } };
}
