import type { NextRequest } from "next/server";
import { uploadCompleteRequest } from "@clipiro/shared";
import { POST as webComplete } from "@/app/api/upload/multipart/complete/route";
import { getAsset } from "@/lib/mobile/assets";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/uploads/complete { key, uploadId, name, mimeType, parts: [{ partNumber, etag }], durationSec?, width?, height? }
// → 201 the new asset. Wraps the web's multipart complete: the size and
// quota are checked again on the real stored object, and a file over the
// limit is removed rather than kept.
export const POST = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, uploadCompleteRequest);
  if (!body.ok) return body.res;
  const { parts, durationSec, ...rest } = body.data;
  const r = await callWeb(webComplete, req, {
    ...rest,
    parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
    ...(durationSec !== undefined ? { duration: durationSec } : {}),
  });
  if (r.status >= 400) return webError(r);
  const id = (r.json.asset as { id?: string } | undefined)?.id;
  const asset = id ? await getAsset(auth.userId, id) : null;
  return asset ? mobileJson(asset, 201) : mobileError(500, "Upload finished but the file couldn't be found. Try again.");
});
