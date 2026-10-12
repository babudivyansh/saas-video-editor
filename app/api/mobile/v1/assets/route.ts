import type { NextRequest } from "next/server";
import { assetKindSchema } from "@clipiro/shared";
import { listAssets } from "@/lib/mobile/assets";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/assets?kind=&folderId=(id|none)&favorites=1&archived=1&ai=1&q=&cursor=
// → { assets, nextCursor }: the caller's library, newest first, 50 a page,
// with signed file and thumbnail links.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const q = req.nextUrl.searchParams;
    const kind = q.get("kind");
    const parsedKind = kind ? assetKindSchema.safeParse(kind) : null;
    if (parsedKind && !parsedKind.success) return mobileError(400, "kind must be video, audio or image", { code: "invalid_request" });
    return mobileJson(
      await listAssets(auth.userId, {
        kind: parsedKind?.data ?? null,
        folderId: q.get("folderId"),
        favorites: q.get("favorites") === "1",
        archived: q.get("archived") === "1",
        ai: q.get("ai") === "1",
        q: (q.get("q") ?? "").trim().slice(0, 100),
        cursor: q.get("cursor"),
      }),
    );
  }),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:assets" },
);
