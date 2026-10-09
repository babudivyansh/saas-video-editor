import type { NextRequest } from "next/server";
import { assetKindSchema, assetSortSchema } from "@clipiro/shared";
import { listAssets } from "@/lib/mobile/assets";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/assets?kind=&folderId=(id|none)&favorites=1&archived=1&ai=1&noAi=1&q=&sort=date|name|size|duration&cursor=
// → { assets, nextCursor, total }: the caller's library, 50 a page,
// with signed file and thumbnail links.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const q = req.nextUrl.searchParams;
    const kind = q.get("kind");
    const parsedKind = kind ? assetKindSchema.safeParse(kind) : null;
    if (parsedKind && !parsedKind.success) return mobileError(400, "kind must be video, audio or image", { code: "invalid_request" });
    const sort = assetSortSchema.safeParse(q.get("sort") ?? "date");
    if (!sort.success) return mobileError(400, "sort must be date, name, size or duration", { code: "invalid_request" });
    return mobileJson(
      await listAssets(auth.userId, {
        kind: parsedKind?.data ?? null,
        folderId: q.get("folderId"),
        favorites: q.get("favorites") === "1",
        archived: q.get("archived") === "1",
        ai: q.get("ai") === "1",
        q: (q.get("q") ?? "").trim().slice(0, 100),
        noAi: q.get("noAi") === "1",
        sort: sort.data,
        cursor: q.get("cursor"),
      }),
    );
  }),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:assets" },
);
