import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { ALLOWED_UPLOAD_MIME } from "@/lib/plans/tiers";
import { extensionForMime, sanitizeS3Key, uploadBufferToS3 } from "@/utils/s3-upload";
import { serializeOneAsset } from "@/lib/asset-serialize";
import {
  adoptUploadedBytes,
  adoptExistingS3Object,
  assertFileSizeAllowed,
  assertUnderStorageQuota,
  AssetLimitError,
  assetLimitStatus,
} from "@/lib/asset-service";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const skipAsset = new URL(req.url).searchParams.get("skipAsset") === "true";

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_UPLOAD_MIME.test(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  // skipAsset callers (e.g. the account-avatar uploaders) are outside the
  // Assets library's primary flow — the returned URL gets stored forever as
  // User.avatarUrl, so this path keeps the original permanent, publicly-served
  // URL it already depends on instead of a short-lived signed one. It still
  // adopts the same object as an Asset (so the image shows up in the user's
  // library too — spec #1 applies to every upload surface, avatars included)
  // and DOES count against the account's storage quota like any other Asset —
  // skipAsset only means "don't return the short-lived signed URL shape",
  // never "skip subscription entitlement enforcement".
  //
  // Security fix (Upload Limits Audit §7/P1): the plan-size/quota check now
  // runs BEFORE the S3 write and BEFORE any response is sent, instead of as a
  // fire-and-forget `.catch()`-only call after the client already got a 200.
  // A rejection here must actually reject the upload.
  if (skipAsset) {
    try {
      const tier = await assertFileSizeAllowed(auth.userId, buffer.length);
      await assertUnderStorageQuota(auth.userId, tier, buffer.length);
    } catch (e) {
      if (e instanceof AssetLimitError) {
        return NextResponse.json(
          { error: e.message, limitBytes: e.limitBytes, usedBytes: e.usedBytes },
          { status: assetLimitStatus(e.kind) },
        );
      }
      throw e;
    }

    const ext = extensionForMime(mimeType);
    const key = sanitizeS3Key(`uploads/${auth.userId}/${randomUUID()}.${ext}`);
    const url = await uploadBufferToS3(buffer, key, mimeType);

    // Entitlement is already verified above against the real buffer length —
    // this remains a best-effort adopt only for non-entitlement failures
    // (e.g. a transient DB error), never for size/quota, which can no longer
    // fail here having already been checked.
    adoptExistingS3Object({
      userId: auth.userId,
      s3Key: key,
      mimeType,
      name: file.name || "avatar",
      size: buffer.length,
      sourceFeature: "avatar",
    }).catch((e) => {
      logger.warn("upload", "best-effort avatar asset adoption failed", { reason: (e as Error).message });
    });

    return NextResponse.json({ url, key });
  }

  try {
    const result = await adoptUploadedBytes({
      userId: auth.userId,
      bytes: buffer,
      mimeType,
      name: file.name,
      sourceFeature: "upload",
      duration: formData.get("duration") ? parseFloat(formData.get("duration") as string) : null,
      width: formData.get("width") ? parseInt(formData.get("width") as string) : null,
      height: formData.get("height") ? parseInt(formData.get("height") as string) : null,
    });

    if (result.duplicate) {
      // Mirror the success response's top-level `url`/`key`, not just
      // `asset.url`. The video-generate flows (useVideoGenerate.uploadVideo ->
      // AutoClip, split-screen, streamer-video) read `data.url` from this
      // response and pass it straight into createProject as
      // `uploadedVideoUrl`. On a duplicate this used to be undefined, so
      // JSON.stringify dropped it and the project was created with a null
      // source — i.e. re-using any video you'd uploaded before broke AutoClip
      // entirely.
      return NextResponse.json({
        duplicate: true,
        url: result.url,
        key: result.key,
        asset: await serializeOneAsset(result.asset),
      });
    }

    return NextResponse.json({
      url: result.url,
      key: result.key,
      asset: await serializeOneAsset(result.asset),
    });
  } catch (e) {
    if (e instanceof AssetLimitError) {
      return NextResponse.json(
        { error: e.message, limitBytes: e.limitBytes, usedBytes: e.usedBytes },
        { status: assetLimitStatus(e.kind) },
      );
    }
    logger.error("upload", "upload failed", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "upload:create" });
