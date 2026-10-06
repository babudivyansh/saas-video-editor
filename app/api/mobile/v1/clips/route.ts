import type { NextRequest } from "next/server";
import { clipAspectSchema } from "@clipiro/shared";
import { listClips } from "@/lib/mobile/projects";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/clips?aspect=9:16&favorites=1&cursor= → { clips, nextCursor }:
// every clip the caller owns, newest first, 30 a page.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const q = req.nextUrl.searchParams;
    const aspect = q.get("aspect");
    const parsed = aspect ? clipAspectSchema.safeParse(aspect) : null;
    if (parsed && !parsed.success) return mobileError(400, "aspect must be 9:16, 16:9 or 1:1", { code: "invalid_request" });
    return mobileJson(await listClips(auth.userId, { aspect: parsed?.data ?? null, favorites: q.get("favorites") === "1", cursor: q.get("cursor") }));
  }),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:clips" },
);
