import type { NextRequest } from "next/server";
import { DELETE as webDelete } from "@/app/api/assets/[id]/route";
import { getAsset } from "@/lib/mobile/assets";
import { callWeb, mobileError, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/v1/assets/:id/archive → the asset, archived (kept 30 days,
// restorable with PATCH { restore: true }). The web's first DELETE archives.
export const POST = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const { id } = await params;
  const asset = await getAsset(auth.userId, id);
  if (!asset) return mobileError(404, "File not found");
  if (asset.archivedAt) return mobileJson(asset);
  const r = await callWeb(webDelete, req, undefined, "DELETE", { id });
  if (r.status >= 400) return webError(r);
  return mobileJson(await getAsset(auth.userId, id));
});
