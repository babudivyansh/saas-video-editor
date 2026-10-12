import type { NextRequest } from "next/server";
import { stockImportRequest } from "@clipiro/shared";
import { POST as webImport } from "@/app/api/editor/stock/import/route";
import { getAsset } from "@/lib/mobile/assets";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/editor/stock/import { type, item } → the new Asset:
// copies a stock search result into the caller's Assets (the web route only
// fetches from the providers it searches), ready to put on the timeline.
export const POST = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, stockImportRequest);
  if (!body.ok) return body.res;
  const { type, item } = body.data;
  const r = await callWeb(webImport, req, { downloadUrl: item.downloadUrl, kind: type, name: item.name, durationSec: item.durationSec, width: item.width, height: item.height });
  if (r.status >= 400) return webError(r);
  const id = (r.json.asset as { id?: string } | undefined)?.id;
  const asset = id ? await getAsset(auth.userId, id) : null;
  return asset ? mobileJson(asset, 201) : mobileError(500, "Imported, but couldn’t read it back. Find it in Assets.");
});
