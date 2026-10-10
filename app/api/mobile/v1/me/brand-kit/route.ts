import type { NextRequest } from "next/server";
import { brandKitPatch } from "@clipiro/shared";
import { BrandKitError, getBrandKit, saveBrandKit } from "@/lib/mobile/brand-kit";
import { mobileError, mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";

// GET /api/mobile/v1/me/brand-kit → { kit }: the latest brand kit, or null.
export const GET = withMobileAuth(async (_req: NextRequest, auth) => mobileJson({ kit: await getBrandKit(auth.userId) }));

// PUT /api/mobile/v1/me/brand-kit { name?, fontName?, fontSize?, colours?, captionTemplateId?, logoAssetId? }
// → { kit }: saves the latest kit, making one on the first save.
export const PUT = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, brandKitPatch);
  if (!body.ok) return body.res;
  try {
    return mobileJson({ kit: await saveBrandKit(auth.userId, body.data) });
  } catch (e) {
    if (e instanceof BrandKitError) return mobileError(e.status, e.message, { code: e.code });
    throw e;
  }
});
