import type { NextRequest } from "next/server";
import { uploadPartUrlsRequest } from "@clipiro/shared";
import { mobileError, mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { getOwnedPendingUpload } from "@/lib/pending-upload";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getMultipartPartUploadUrl } from "@/utils/s3-upload";

// POST /api/mobile/v1/uploads/part-urls { key, uploadId, partNumbers } → { parts }:
// fresh links for parts past the first 500, or whose link expired (an hour).
// Only for an upload the caller started.
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const body = await parseBody(req, uploadPartUrlsRequest);
    if (!body.ok) return body.res;
    const { key, uploadId, partNumbers } = body.data;
    if (!(await getOwnedPendingUpload(auth.userId, key, uploadId))) return mobileError(404, "Upload not found");
    const parts = await Promise.all([...new Set(partNumbers)].map(async (n) => ({ partNumber: n, url: await getMultipartPartUploadUrl(key, uploadId, n) })));
    return mobileJson({ parts });
  }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:upload-part-urls" },
);
