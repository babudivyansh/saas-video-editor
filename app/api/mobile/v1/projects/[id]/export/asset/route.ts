import type { NextRequest } from "next/server";
import { AssetLimitError, assetLimitStatus } from "@/lib/asset-service";
import { saveExportToAssets } from "@/lib/mobile/editor";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/v1/projects/:id/export/asset → the new Asset (201).
// Saves a copy of the edit's latest export into the caller's Assets (the
// render itself is overwritten by the next export). 409 not_exported until
// an export has finished; 413 / 402 when the file or storage limit is hit.
export const POST = withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
  try {
    const r = await saveExportToAssets(auth.userId, (await params).id);
    if (r === "not-found") return mobileError(404, "Edit not found");
    if (r === "not-exported") return mobileError(409, "Export the video first.", { code: "not_exported" });
    return mobileJson(r, 201);
  } catch (e) {
    if (e instanceof AssetLimitError) return mobileError(assetLimitStatus(e.kind), e.message, { code: e.kind });
    throw e;
  }
});
