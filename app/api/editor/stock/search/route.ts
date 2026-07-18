import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import {
  searchStockImages,
  searchStockVideos,
  searchStockAudio,
  searchStockStickers,
  searchStockGifs,
  StockNotConfiguredError,
} from "@/lib/editor/stock-providers";
import { logger } from "@/lib/logger";

// GET /api/editor/stock/search?type=image|video|audio|sticker|gif&q=...&page=1
// Proxies to the relevant provider so API keys stay server-side.
async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const q = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(24, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10) || 24));

  if (!q) return NextResponse.json({ items: [] });

  try {
    let items;
    switch (type) {
      case "image":
        items = await searchStockImages(q, page);
        break;
      case "video":
        items = await searchStockVideos(q, page);
        break;
      case "audio":
        items = await searchStockAudio(q, page);
        break;
      case "sticker":
        items = await searchStockStickers(q, page);
        break;
      case "gif":
        items = await searchStockGifs(q, limit);
        break;
      default:
        return NextResponse.json({ error: "type must be image, video, audio, sticker, or gif" }, { status: 400 });
    }
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof StockNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    logger.error("stock/search", "request failed", err);
    return NextResponse.json({ error: "Stock search failed" }, { status: 500 });
  }
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "stock:search" });
