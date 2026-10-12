import type { NextRequest } from "next/server";
import { GET as webAssets } from "@/app/api/assets/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

// GET /api/mobile/v1/assets/storage → { usedBytes, limitBytes, maxUploadBytes, count }:
// the plan's storage meter and per-file cap. Wraps the web's ?stats=true.
export const GET = withMobileAuth(async (req: NextRequest) => {
  const r = await callWeb(webAssets, req, undefined, "GET", undefined, { stats: "true" });
  if (r.status >= 400) return webError(r);
  const { usedBytes, limitBytes, maxUploadBytes, count } = r.json as Record<string, number>;
  return mobileJson({ usedBytes, limitBytes, maxUploadBytes, count });
});
