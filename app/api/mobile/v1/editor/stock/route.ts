import type { NextRequest } from "next/server";
import { STOCK_TYPES } from "@clipiro/shared";
import { GET as webSearch } from "@/app/api/editor/stock/search/route";
import { callWeb, mobileError, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

// GET /api/mobile/v1/editor/stock?type=video|image|audio&q=&page= → { items }.
// Wraps the web's stock search (provider keys stay on the server).
export const GET = withMobileAuth(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const type = p.get("type") ?? "video";
  if (!(STOCK_TYPES as readonly string[]).includes(type)) return mobileError(400, "type must be video, image or audio", { code: "invalid_request" });
  const q = (p.get("q") ?? "").trim().slice(0, 100);
  if (!q) return mobileJson({ items: [] });
  const r = await callWeb(webSearch, req, undefined, "GET", undefined, { type, q, page: String(Math.max(1, Number(p.get("page")) || 1)) });
  if (r.status >= 400) return webError(r);
  return mobileJson({ items: Array.isArray(r.json.items) ? r.json.items : [] });
});
