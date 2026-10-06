import type { NextRequest } from "next/server";
import { uploadAbortRequest } from "@clipiro/shared";
import { POST as webAbort } from "@/app/api/upload/multipart/abort/route";
import { callWeb, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/uploads/abort { key, uploadId } → { ok }: the user
// cancelled, so the parts already stored are dropped. Wraps the web route.
export const POST = withMobileAuth(async (req: NextRequest) => {
  const body = await parseBody(req, uploadAbortRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webAbort, req, body.data);
  if (r.status >= 400) return webError(r);
  return mobileJson({ ok: true });
});
