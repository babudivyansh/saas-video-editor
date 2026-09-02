import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { deleteS3Object } from "@/utils/s3-upload";
import { serializeOneAsset } from "@/lib/asset-serialize";
import { auditAssetAction } from "@/lib/asset-audit";
import { trackOnboardingEvent } from "@/lib/onboarding-analytics";

async function getOwnedAsset(id: string, userId: string) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset || asset.userId !== userId) return null;
  return asset;
}

interface PatchBody {
  name?: string;
  folderId?: string | null;
  isFavorite?: boolean;
  tags?: string[];
  restore?: boolean;
}

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await getOwnedAsset(id, auth.userId);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return NextResponse.json({ error: "Name required" }, { status: 400 });
    data.name = trimmed;
  }
  if (body.folderId !== undefined) {
    if (body.folderId !== null) {
      const folder = await prisma.assetFolder.findFirst({ where: { id: body.folderId, userId: auth.userId } });
      if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    data.folderId = body.folderId;
  }
  if (body.isFavorite !== undefined) data.isFavorite = body.isFavorite;
  if (body.restore) data.archivedAt = null;

  if (body.tags !== undefined) {
    const names = [...new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    await prisma.$transaction(async (tx) => {
      await tx.assetTag.deleteMany({ where: { assetId: id } });
      for (const name of names) {
        const tag = await tx.tag.upsert({
          where: { userId_name: { userId: auth.userId, name } },
          create: { userId: auth.userId, name },
          update: {},
        });
        await tx.assetTag.create({ data: { assetId: id, tagId: tag.id } });
      }
    });
  }

  const updated = Object.keys(data).length > 0
    ? await prisma.asset.update({ where: { id }, data })
    : asset;

  if (body.restore) await auditAssetAction(auth.userId, "restore", id);
  else if (body.name !== undefined) {
    await auditAssetAction(auth.userId, "rename", id, { name: data.name });
    trackOnboardingEvent(auth.userId, "asset_renamed", { assetId: id });
  }

  return NextResponse.json({ asset: await serializeOneAsset(updated) });
}

// First DELETE archives (soft-delete); calling DELETE again on an
// already-archived asset permanently removes it (S3 + DB) — same two-step
// "trash, then empty the trash" pattern as most consumer file managers.
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await getOwnedAsset(id, auth.userId);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!asset.archivedAt) {
    await prisma.asset.update({ where: { id }, data: { archivedAt: new Date() } });
    await auditAssetAction(auth.userId, "archive", id, { name: asset.name });
    return NextResponse.json({ status: "archived" });
  }

  await deleteS3Object(asset.s3Key);
  if (asset.thumbnailS3Key) await deleteS3Object(asset.thumbnailS3Key).catch(() => {});
  await prisma.asset.delete({ where: { id } });
  await auditAssetAction(auth.userId, "delete", id, { name: asset.name, size: asset.size });
  trackOnboardingEvent(auth.userId, "asset_deleted", { assetId: id, sourceFeature: asset.sourceFeature });

  return NextResponse.json({ status: "deleted" });
}

export const PATCH = withRateLimit(handlePATCH, { limit: 60, windowSec: 60, keyBy: "user", name: "assets:patch" });
export const DELETE = withRateLimit(handleDELETE, { limit: 60, windowSec: 60, keyBy: "user", name: "assets:delete" });
