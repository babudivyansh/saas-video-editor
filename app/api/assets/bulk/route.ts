import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { deleteS3Object } from "@/utils/s3-upload";
import { auditAssetAction } from "@/lib/asset-audit";
import { enqueueAssetZip } from "@/lib/asset-zip";

const MAX_IDS = 200;

type BulkAction = "archive" | "restore" | "permanentDelete" | "move" | "tag" | "favorite" | "unfavorite" | "download";

interface BulkBody {
  action?: BulkAction;
  ids?: string[];
  folderId?: string | null;
  tags?: string[];
}

async function ownedIds(ids: string[], userId: string): Promise<string[]> {
  const rows = await prisma.asset.findMany({ where: { id: { in: ids }, userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as BulkBody;
  const action = body.action;
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)].slice(0, MAX_IDS) : [];
  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });

  const scoped = await ownedIds(ids, auth.userId);
  if (scoped.length === 0) return NextResponse.json({ error: "No matching assets found" }, { status: 404 });

  switch (action) {
    case "archive": {
      await prisma.asset.updateMany({ where: { id: { in: scoped }, userId: auth.userId }, data: { archivedAt: new Date() } });
      await auditAssetAction(auth.userId, "bulk_archive", undefined, { ids: scoped });
      return NextResponse.json({ updated: scoped.length });
    }
    case "restore": {
      await prisma.asset.updateMany({ where: { id: { in: scoped }, userId: auth.userId }, data: { archivedAt: null } });
      await auditAssetAction(auth.userId, "bulk_restore", undefined, { ids: scoped });
      return NextResponse.json({ updated: scoped.length });
    }
    case "favorite":
    case "unfavorite": {
      await prisma.asset.updateMany({ where: { id: { in: scoped }, userId: auth.userId }, data: { isFavorite: action === "favorite" } });
      await auditAssetAction(auth.userId, "bulk_favorite", undefined, { ids: scoped, favorite: action === "favorite" });
      return NextResponse.json({ updated: scoped.length });
    }
    case "move": {
      if (body.folderId) {
        const folder = await prisma.assetFolder.findFirst({ where: { id: body.folderId, userId: auth.userId } });
        if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
      await prisma.asset.updateMany({ where: { id: { in: scoped }, userId: auth.userId }, data: { folderId: body.folderId ?? null } });
      await auditAssetAction(auth.userId, "bulk_move", undefined, { ids: scoped, folderId: body.folderId ?? null });
      return NextResponse.json({ updated: scoped.length });
    }
    case "tag": {
      const names = [...new Set((body.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
      if (names.length === 0) return NextResponse.json({ error: "tags must be a non-empty array" }, { status: 400 });
      await prisma.$transaction(async (tx) => {
        const tagRows = await Promise.all(
          names.map((name) => tx.tag.upsert({
            where: { userId_name: { userId: auth.userId, name } },
            create: { userId: auth.userId, name },
            update: {},
          })),
        );
        for (const assetId of scoped) {
          for (const tag of tagRows) {
            await tx.assetTag.upsert({
              where: { assetId_tagId: { assetId, tagId: tag.id } },
              create: { assetId, tagId: tag.id },
              update: {},
            });
          }
        }
      });
      await auditAssetAction(auth.userId, "bulk_tag", undefined, { ids: scoped, tags: names });
      return NextResponse.json({ updated: scoped.length });
    }
    case "permanentDelete": {
      const assets = await prisma.asset.findMany({
        where: { id: { in: scoped }, userId: auth.userId },
        select: { id: true, s3Key: true, thumbnailS3Key: true, size: true, name: true },
      });
      const results = await Promise.allSettled(
        assets.flatMap((a) => [deleteS3Object(a.s3Key), ...(a.thumbnailS3Key ? [deleteS3Object(a.thumbnailS3Key)] : [])]),
      );
      const s3Failures = results.filter((r) => r.status === "rejected").length;
      await prisma.asset.deleteMany({ where: { id: { in: scoped }, userId: auth.userId } });
      await auditAssetAction(auth.userId, "bulk_delete", undefined, { ids: scoped, s3Failures });
      return NextResponse.json({ deleted: scoped.length, s3Failures });
    }
    case "download": {
      const jobId = enqueueAssetZip(auth.userId, scoped);
      return NextResponse.json({ jobId }, { status: 202 });
    }
    default:
      return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "assets:bulk" });
