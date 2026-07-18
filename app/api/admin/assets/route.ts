import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";

// Real Assets-library storage visibility for admins — the audit's ops
// "storage report" was Postgres table size only (row count, not bytes
// actually held in S3), with no per-user breakdown and no way to spot abuse
// or a stuck moderation queue. This is the closing piece.
export const GET = withAdmin(async () => {
  const [totals, byUser, flagged, pendingUploads, archived] = await Promise.all([
    prisma.asset.aggregate({ where: { archivedAt: null }, _sum: { size: true }, _count: true }),
    prisma.asset.groupBy({
      by: ["userId"],
      where: { archivedAt: null },
      _sum: { size: true },
      _count: true,
      orderBy: { _sum: { size: "desc" } },
      take: 10,
    }),
    prisma.asset.findMany({
      where: { moderationStatus: "flagged" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, name: true, kind: true, size: true, moderationLabels: true, createdAt: true, userId: true },
    }),
    prisma.pendingUpload.count({ where: { createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } } }),
    prisma.asset.aggregate({ where: { archivedAt: { not: null } }, _sum: { size: true }, _count: true }),
  ]);

  const userIds = [...new Set([...byUser.map((u) => u.userId), ...flagged.map((f) => f.userId)])];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    totalBytes: totals._sum.size ?? 0,
    totalAssets: totals._count,
    archivedBytes: archived._sum.size ?? 0,
    archivedCount: archived._count,
    orphanedPendingUploads: pendingUploads,
    topUsers: byUser.map((u) => ({
      userId: u.userId,
      email: userById.get(u.userId)?.email ?? "unknown",
      name: userById.get(u.userId)?.name ?? null,
      bytes: u._sum.size ?? 0,
      count: u._count,
    })),
    flaggedAssets: flagged.map((f) => ({
      ...f,
      user: userById.get(f.userId) ?? null,
    })),
  });
});
