import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { downloadFile } from "@/utils/download";
import { isAllowedStockHost, isAllowedStockUrl } from "@/lib/stock-hosts";
import { uploadFileToS3, getAssetReadUrl } from "@/utils/s3-upload";
import { auditAssetAction } from "@/lib/asset-audit";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 120;

// Only fetch from the stock providers we actually search — the downloadUrl
// is client-supplied (it's just what our own /stock/search returned). The list
// lives in lib/stock-hosts.ts, shared with every other stock fetch, and is
// re-checked on every redirect hop by downloadFile's allowHost.

const KIND_EXT: Record<string, string> = { image: "jpg", video: "mp4", audio: "mp3" };
const KIND_MIME: Record<string, string> = { image: "image/jpeg", video: "video/mp4", audio: "audio/mpeg" };
// Intentionally NOT plan-aware (Upload Limits Audit §28): this downloads
// from a controlled, licensed stock-media provider, not an arbitrary
// user-supplied file — a different threat/cost model than direct user
// upload, so it stays a flat feature/provider-technical guard rather than a
// per-tier cap. 100 MB is generous for a stock photo/clip/track.
const MAX_BYTES = 100 * 1024 * 1024;

// POST /api/editor/stock/import { downloadUrl, kind, name, width?, height?, durationSec? }
// Downloads a stock item server-side and re-hosts it as a normal Asset, so
// the editor/render pipeline only ever deals with assets it owns — never a
// client-supplied third-party URL.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const downloadUrl = typeof body.downloadUrl === "string" ? body.downloadUrl : "";
  const kind = body.kind as string | undefined;
  const name = typeof body.name === "string" ? body.name.slice(0, 200) : "Stock asset";

  if (!downloadUrl || !kind || !(kind in KIND_EXT)) {
    return NextResponse.json({ error: "downloadUrl and a valid kind are required" }, { status: 400 });
  }
  if (!isAllowedStockUrl(downloadUrl)) {
    return NextResponse.json({ error: "Unsupported source host" }, { status: 400 });
  }

  const tmpPath = path.join(os.tmpdir(), `stock-${randomUUID()}.${KIND_EXT[kind]}`);
  try {
    // Cap enforced DURING the transfer (the size check below only ran after the
    // whole file had landed on disk), and every redirect hop must stay on an
    // allowed host — an allowed host redirecting to an internal address was
    // the hole the up-front check alone left open.
    await downloadFile(downloadUrl, tmpPath, undefined, {
      maxBytes: MAX_BYTES,
      allowHost: (host) => isAllowedStockHost(host),
    });

    const stat = fs.statSync(tmpPath);
    if (stat.size > MAX_BYTES) {
      throw new Error("Stock file too large");
    }

    const key = `stock-imports/${auth.userId}/${randomUUID()}.${KIND_EXT[kind]}`;
    const url = await uploadFileToS3(tmpPath, key, KIND_MIME[kind]);

    const asset = await prisma.asset.create({
      data: {
        userId: auth.userId,
        name,
        s3Key: key,
        url,
        mimeType: KIND_MIME[kind],
        kind,
        size: stat.size,
        // Licensed stock content from a vetted provider (Pexels/Jamendo/Giphy)
        // — not user-generated, so it's excluded from the moderation queue
        // rather than left "pending" forever.
        moderationStatus: "skipped",
        duration: typeof body.durationSec === "number" ? body.durationSec : undefined,
        width: typeof body.width === "number" ? body.width : undefined,
        height: typeof body.height === "number" ? body.height : undefined,
      },
    });
    await auditAssetAction(auth.userId, "upload", asset.id, { name: asset.name, size: asset.size, source: "stock" });

    const readUrl = await getAssetReadUrl(key);
    return NextResponse.json({ asset: { ...asset, url: readUrl } });
  } catch (err) {
    logger.error("stock/import", "request failed", err);
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "stock:import" });
