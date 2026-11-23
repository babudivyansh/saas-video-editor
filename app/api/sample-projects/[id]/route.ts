import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { adoptExistingS3Object, AssetLimitError, assetLimitStatus } from "@/lib/asset-service";
import { serializeOneAsset } from "@/lib/asset-serialize";
import { sampleThumbnailKey, sampleVideo, sampleVideoKey } from "@/lib/sample-projects";
import { logger } from "@/lib/logger";

// Puts a sample video in the user's Assets so Home's launch box can start an
// AutoClip run from it. The Asset references the one shared object
// (lib/sample-projects.ts), and picking the same sample again returns the row
// the user already has. Being shared, it doesn't count toward their storage
// (COUNTS_TOWARD_STORAGE); a run on it costs Clip Minutes like any other run.
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sample = sampleVideo(id);
  if (!sample) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let adopted;
  try {
    adopted = await adoptExistingS3Object({
      userId: auth.userId,
      s3Key: sampleVideoKey(sample.id),
      thumbnailS3Key: sampleThumbnailKey(sample.id),
      mimeType: "video/mp4",
      name: sample.assetName,
      sourceFeature: "sample",
      duration: sample.duration,
      width: sample.width,
      height: sample.height,
      // Our own curated file: nothing for moderation to find.
      skipModeration: true,
    });
  } catch (e) {
    if (e instanceof AssetLimitError) {
      return NextResponse.json({ error: e.message, code: e.kind }, { status: assetLimitStatus(e.kind) });
    }
    // HeadObject failing means the file isn't in the bucket.
    logger.error("sample-projects", "couldn't add a sample video", { id: sample.id, e: String(e) });
    return NextResponse.json({ error: "This sample isn't available right now. Try another one." }, { status: 503 });
  }

  // A sample the user archived earlier comes back to the library.
  let row = adopted.asset;
  if (row.archivedAt) row = { ...(await prisma.asset.update({ where: { id: row.id }, data: { archivedAt: null } })), url: row.url };

  return NextResponse.json({ asset: await serializeOneAsset(row) }, { status: adopted.duplicate ? 200 : 201 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "sample-projects:adopt" });
