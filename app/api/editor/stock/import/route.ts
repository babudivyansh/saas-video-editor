import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { downloadFile } from "@/utils/download";
import { uploadFileToS3, getAssetReadUrl } from "@/utils/s3-upload";
import { auditAssetAction } from "@/lib/asset-audit";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 120;

// Only fetch from the stock providers we actually search — the downloadUrl
// is client-supplied (it's just what our own /stock/search returned), but
// without this allowlist a crafted request could turn this route into an
// open server-side fetch proxy (SSRF against internal/cloud-metadata hosts).
const ALLOWED_HOSTS = [
  "images.pexels.com",
  "videos.pexels.com",
  "player.vimeo.com",
  "prod.jamendo.com",
  "media.jamendo.com",
  /\.jamendo\.com$/,
  /\.giphy\.com$/,
];

function hostAllowed(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return ALLOWED_HOSTS.some((h) => (typeof h === "string" ? h === hostname : h.test(hostname)));
}

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
  if (!hostAllowed(downloadUrl)) {
    return NextResponse.json({ error: "Unsupported source host" }, { status: 400 });
  }

  const tmpPath = path.join(os.tmpdir(), `stock-${randomUUID()}.${KIND_EXT[kind]}`);
  try {
    await downloadFile(downloadUrl, tmpPath);

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
