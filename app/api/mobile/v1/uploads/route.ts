import type { NextRequest } from "next/server";
import { uploadStartRequest } from "@clipiro/shared";
import { POST as webCreate } from "@/app/api/upload/multipart/create/route";
import { UPLOAD_PART_BYTES } from "@/lib/mobile/assets";
import { callWeb, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";
import { getMultipartPartUploadUrl } from "@/utils/s3-upload";

const FIRST_URLS = 500; // 5 GB at 10 MB a part; more via /uploads/part-urls

// POST /api/mobile/v1/uploads { name, mimeType, sizeBytes } →
// { key, uploadId, partSizeBytes, parts: [{ partNumber, url }] }.
// Starts a direct-to-storage upload: the web's multipart create (file type,
// per-file cap and storage quota checked up front), plus the presigned PUT
// URLs for the parts, so the phone needs no round trip per part.
export const POST = withMobileAuth(async (req: NextRequest) => {
  const body = await parseBody(req, uploadStartRequest);
  if (!body.ok) return body.res;
  const { name, mimeType, sizeBytes } = body.data;
  const r = await callWeb(webCreate, req, { name, mimeType, size: sizeBytes });
  if (r.status >= 400) return webError(r);
  const key = String(r.json.key);
  const uploadId = String(r.json.uploadId);
  const count = Math.min(Math.ceil(sizeBytes / UPLOAD_PART_BYTES), FIRST_URLS);
  const parts = await Promise.all(
    Array.from({ length: count }, async (_, i) => ({ partNumber: i + 1, url: await getMultipartPartUploadUrl(key, uploadId, i + 1) })),
  );
  return mobileJson({ key, uploadId, partSizeBytes: UPLOAD_PART_BYTES, parts }, 201);
});
