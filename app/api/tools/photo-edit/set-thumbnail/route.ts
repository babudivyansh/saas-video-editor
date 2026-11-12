import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { parseS3Url } from "@/lib/s3-url";
import { resignMediaUrl } from "@/lib/signed-media";
import { downloadS3ObjectToBuffer, uploadBufferToS3, deleteS3Object } from "@/utils/s3-upload";

// POST /api/tools/photo-edit/set-thumbnail { assetId, clipId }
// "Use as clip thumbnail": the photo becomes the clip's cover in Library,
// Projects and the clip page. It is cropped to the clip's shape and written to
// a NEW key (signed URLs are stable for 15 minutes, so overwriting the old key
// would keep showing the old cover), then the previous thumbnail object is
// deleted: the clip owns exactly one, which the clip's own DELETE removes.
// A later re-render of the clip replaces it with a frame again.

const SIZE: Record<string, [number, number]> = {
  "9:16": [720, 1280],
  "1:1": [1080, 1080],
  "16:9": [1280, 720],
  "4:5": [1080, 1350],
};

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { assetId?: unknown; clipId?: unknown };
  if (typeof body.assetId !== "string" || typeof body.clipId !== "string") {
    return NextResponse.json({ error: "Choose a photo and a clip." }, { status: 400 });
  }

  const [asset, clip] = await Promise.all([
    prisma.asset.findFirst({ where: { id: body.assetId, userId: auth.userId, archivedAt: null }, select: { s3Key: true, kind: true, size: true } }),
    prisma.clip.findFirst({ where: { id: body.clipId, project: { userId: auth.userId } }, select: { id: true, thumbnailUrl: true, aspectRatio: true } }),
  ]);
  if (!asset) return NextResponse.json({ error: "That photo isn't in your Assets." }, { status: 404 });
  if (!clip) return NextResponse.json({ error: "That clip isn't yours or no longer exists." }, { status: 404 });
  if (asset.kind !== "image") return NextResponse.json({ error: "Only images can be used as a thumbnail." }, { status: 400 });
  if (Number(asset.size) > 20 * 1024 * 1024) return NextResponse.json({ error: "This image is too large." }, { status: 400 });

  const [w, h] = SIZE[clip.aspectRatio ?? ""] ?? SIZE["9:16"];
  let jpeg: Buffer;
  try {
    jpeg = await sharp(await downloadS3ObjectToBuffer(asset.s3Key))
      .rotate()
      .resize(w, h, { fit: "cover", position: "attention" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "We couldn't read this image." }, { status: 400 });
  }

  const key = `thumbnails/${auth.userId}/${clip.id}-${randomUUID().slice(0, 8)}.jpg`;
  const url = await uploadBufferToS3(jpeg, key, "image/jpeg");
  await prisma.clip.update({ where: { id: clip.id }, data: { thumbnailUrl: url } });

  // Best-effort: the clip already points at the new cover.
  const oldKey = parseS3Url(clip.thumbnailUrl ?? "")?.key;
  if (oldKey && oldKey !== key) {
    await deleteS3Object(oldKey).catch((e) => logger.warn("photo-edit", "old clip thumbnail not deleted", { key: oldKey, e: String(e) }));
  }

  return NextResponse.json({ thumbnailUrl: await resignMediaUrl(url) });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "tools:photo-edit:set-thumbnail" });
