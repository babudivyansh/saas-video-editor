import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { detectSilences } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";

// POST /api/editor/silences { assetId, srcIn, duration, noiseDb?, minSilenceSec? }
// Finds the quiet stretches in the part of a video/audio asset that's on the
// timeline (source seconds), for the editor's "Remove silences". Free: a single
// ffmpeg pass over the audio, no provider call. The client turns the spans into
// timeline cuts and asks before applying them.

const MAX_SPAN_SEC = 30 * 60;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const assetId = typeof body.assetId === "string" ? body.assetId : null;
  const srcIn = Number(body.srcIn ?? 0);
  const duration = Number(body.duration);
  const noiseDb = body.noiseDb == null ? -35 : Number(body.noiseDb);
  const minSilenceSec = body.minSilenceSec == null ? 0.6 : Number(body.minSilenceSec);

  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
  if (!Number.isFinite(srcIn) || srcIn < 0 || !Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: "srcIn and duration must be positive numbers" }, { status: 400 });
  }
  if (duration > MAX_SPAN_SEC) return NextResponse.json({ error: "That clip is too long to scan (30 minutes max)." }, { status: 400 });
  if (!Number.isFinite(noiseDb) || noiseDb < -60 || noiseDb > -10) return NextResponse.json({ error: "noiseDb must be between -60 and -10" }, { status: 400 });
  if (!Number.isFinite(minSilenceSec) || minSilenceSec < 0.2 || minSilenceSec > 5) return NextResponse.json({ error: "minSilenceSec must be between 0.2 and 5" }, { status: 400 });

  // Ownership: only the caller's own media.
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId: auth.userId, archivedAt: null }, select: { s3Key: true, kind: true } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (asset.kind !== "video" && asset.kind !== "audio") return NextResponse.json({ error: "Only video or audio has sound to scan" }, { status: 400 });

  try {
    const url = await getAssetReadUrl(asset.s3Key, 600);
    const silences = await detectSilences(url, { startSec: srcIn, durationSec: duration, noiseDb, minSilenceSec });
    return NextResponse.json({ silences });
  } catch (err) {
    logger.error("editor-silences", "silence scan failed", err);
    return NextResponse.json({ error: "Couldn't scan this clip for silence — try again." }, { status: 500 });
  }
}

// One ffmpeg pass per call; a person scans a handful of clips at a time.
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "editor:silences" });
