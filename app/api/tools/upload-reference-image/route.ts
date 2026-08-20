import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { withRateLimit } from "@/lib/with-rate-limit";
import { adoptExistingS3Object } from "@/lib/asset-service";
import { resolveUploadPolicy, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { logger } from "@/lib/logger";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

// Uploads a reference/lead-frame image to S3 and returns a public URL, for use
// as the `referenceImageUrl` sent to /api/tools/video-generator — several
// video models (Kling, PixVerse, etc.) require or accept an image input.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "image is required" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, WEBP images are supported" }, { status: 400 });
  }
  const policy = await resolveUploadPolicy(auth.userId, "reference-image");
  try {
    assertWithinUploadPolicy(policy, file.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `reference-images/${auth.userId}/${randomUUID()}.${ext}`;
  const url = await uploadBufferToS3(buffer, key, file.type);

  // Global Asset Library: this reference image is a real user input — adopt
  // the object we just wrote as an Asset (no re-upload, same key) so it shows
  // up in the library and can be reused elsewhere. Best-effort: the caller
  // already has the permanent URL it needs for video-generator, so a failure
  // here must never fail the reference-image upload itself.
  adoptExistingS3Object({
    userId: auth.userId,
    s3Key: key,
    mimeType: file.type,
    name: file.name || "reference-image",
    size: buffer.length,
    sourceFeature: "video-generator",
  }).catch((e) => {
    logger.warn("upload-reference-image", "best-effort asset adoption failed", { reason: (e as Error).message });
  });

  return NextResponse.json({ url });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "tools:upload-reference-image" });
