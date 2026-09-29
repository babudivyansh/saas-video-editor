import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { deleteS3Object } from "@/utils/s3-upload";
import { collectProjectMediaKeys, deleteUnreferencedKeys } from "@/lib/storage-cleanup";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";

// Admin content browser + delete — projects (with their clips) and library
// assets, across every account or filtered to one. Deletes remove the S3
// objects too, using the same rules as the user's own delete buttons:
//   • project: its source/render/clip keys, minus anything a library Asset
//     still references (lib/storage-cleanup.ts), then the row (clips cascade)
//   • asset:   its media + thumbnail key, then the row

export type ContentKind = "project" | "asset";

export interface ContentQuery {
  kind: ContentKind;
  userId?: string;
  /** Matches the owner's email, or the item's title / name. */
  search?: string;
  /** Assets only: "flagged" (moderation), "archived", or everything active. */
  filter?: "all" | "flagged" | "archived";
  cursor?: string;
  limit?: number;
}

export interface ContentRow {
  id: string;
  kind: ContentKind;
  title: string;
  detail: string;
  status: string;
  sizeBytes: number | null;
  createdAt: string;
  owner: { id: string; email: string };
}

export async function listContent(q: ContentQuery): Promise<{ rows: ContentRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
  const search = q.search?.trim();
  const page = { take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}), orderBy: { createdAt: "desc" as const } };

  let rows: ContentRow[];
  if (q.kind === "project") {
    const projects = await prisma.project.findMany({
      where: {
        ...(q.userId ? { userId: q.userId } : {}),
        ...(search
          ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { user: { email: { contains: search, mode: "insensitive" } } }] }
          : {}),
      },
      select: {
        id: true, title: true, productType: true, status: true, createdAt: true,
        user: { select: { id: true, email: true } },
        _count: { select: { clips: true } },
      },
      ...page,
    });
    rows = projects.map((p) => ({
      id: p.id,
      kind: "project",
      title: p.title || "(untitled)",
      detail: `${p.productType} · ${p._count.clips} clip(s)`,
      status: p.status,
      sizeBytes: null,
      createdAt: p.createdAt.toISOString(),
      owner: p.user,
    }));
  } else {
    const assets = await prisma.asset.findMany({
      where: {
        ...(q.userId ? { userId: q.userId } : {}),
        ...(q.filter === "flagged" ? { moderationStatus: "flagged" } : q.filter === "archived" ? { archivedAt: { not: null } } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { user: { email: { contains: search, mode: "insensitive" } } }] }
          : {}),
      },
      select: {
        id: true, name: true, kind: true, mimeType: true, size: true, createdAt: true, archivedAt: true, moderationStatus: true,
        user: { select: { id: true, email: true } },
      },
      ...page,
    });
    rows = assets.map((a) => ({
      id: a.id,
      kind: "asset",
      title: a.name,
      detail: `${a.kind} · ${a.mimeType}`,
      status: a.moderationStatus === "flagged" ? "flagged" : a.archivedAt ? "archived" : "active",
      sizeBytes: a.size,
      createdAt: a.createdAt.toISOString(),
      owner: a.user,
    }));
  }

  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);
  return { rows, nextCursor: hasMore ? rows[rows.length - 1].id : null };
}

export interface DeleteContentResult {
  deleted: number;
  objectsDeleted: number;
  notFound: number;
}

/** Deletes projects or assets by id (optionally scoped to one owner), S3 included. */
export async function deleteContent(kind: ContentKind, ids: string[], userId?: string): Promise<DeleteContentResult> {
  const unique = [...new Set(ids)];
  const scope = { id: { in: unique }, ...(userId ? { userId } : {}) };

  if (kind === "project") {
    const projects = await prisma.project.findMany({ where: scope, select: { id: true, userId: true } });
    const keys = (await Promise.all(projects.map((p) => collectProjectMediaKeys({ id: p.id })))).flat();
    await prisma.project.deleteMany({ where: { id: { in: projects.map((p) => p.id) } } });
    const objectsDeleted = await deleteUnreferencedKeys([...new Set(keys)], `admin delete of ${projects.length} project(s)`);
    await Promise.allSettled([...new Set(projects.map((p) => p.userId))].map((u) => invalidateDashboardSummary(u)));
    return { deleted: projects.length, objectsDeleted, notFound: unique.length - projects.length };
  }

  const assets = await prisma.asset.findMany({ where: scope, select: { id: true, s3Key: true, thumbnailS3Key: true } });
  await prisma.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
  const keys = assets.flatMap((a) => [a.s3Key, a.thumbnailS3Key]).filter((k): k is string => !!k);
  const results = await Promise.allSettled(keys.map((k) => deleteS3Object(k)));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) logger.warn("admin-content", `${failed}/${keys.length} asset object deletes failed`);
  return { deleted: assets.length, objectsDeleted: keys.length - failed, notFound: unique.length - assets.length };
}
