import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { measureColorStats } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";
import { FILTER_PRESETS, type FilterPreset, type VideoAdjust } from "@/lib/editor/types";
import { adjustFilters } from "@/lib/editor/video-look";
import { averageStats, matchAdjust } from "@/lib/editor/color-match";

// POST /api/editor/color-match { target, reference }
//   each: { assetId, srcIn, duration, filter? } — reference may add `adjust`.
// Measures both clips (the parts on the timeline, after their filter preset,
// and the reference's own fine-tune too) with ffmpeg signalstats and returns
// the fine-tune that makes the target look like the reference. Free: two
// short ffmpeg passes on a 320px copy, no provider call. The client applies it
// as an ordinary, undoable fine-tune.

const SAMPLE_SEC = 10;

interface Side { assetId: string; srcIn: number; duration: number; filter?: FilterPreset; adjust?: VideoAdjust }

function parseSide(raw: unknown, allowAdjust: boolean): Side | string {
  if (!raw || typeof raw !== "object") return "missing clip";
  const b = raw as Record<string, unknown>;
  if (typeof b.assetId !== "string" || !b.assetId) return "assetId required";
  const srcIn = Number(b.srcIn ?? 0);
  const duration = Number(b.duration);
  if (!Number.isFinite(srcIn) || srcIn < 0 || !Number.isFinite(duration) || duration <= 0) return "srcIn and duration must be positive numbers";
  let filter: FilterPreset | undefined;
  if (b.filter != null) {
    if (typeof b.filter !== "string" || !(b.filter in FILTER_PRESETS)) return "unknown filter";
    filter = b.filter as FilterPreset;
  }
  let adjust: VideoAdjust | undefined;
  if (allowAdjust && b.adjust != null) {
    const a = b.adjust as Record<string, unknown>;
    const ok = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
    if (!ok(a.brightness, -0.3, 0.3) || !ok(a.contrast, 0.5, 1.5) || !ok(a.saturation, 0, 2) || !ok(a.warmth, -1, 1)) return "invalid adjust";
    adjust = { brightness: a.brightness as number, contrast: a.contrast as number, saturation: a.saturation as number, warmth: a.warmth as number };
  }
  return { assetId: b.assetId, srcIn, duration, filter, adjust };
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const target = parseSide(body.target, false);
  const reference = parseSide(body.reference, true);
  if (typeof target === "string") return NextResponse.json({ error: `target: ${target}` }, { status: 400 });
  if (typeof reference === "string") return NextResponse.json({ error: `reference: ${reference}` }, { status: 400 });

  // Ownership: only the caller's own video.
  const ids = [...new Set([target.assetId, reference.assetId])];
  const assets = await prisma.asset.findMany({
    where: { id: { in: ids }, userId: auth.userId, archivedAt: null },
    select: { id: true, s3Key: true, kind: true },
  });
  const byId = new Map(assets.map((a) => [a.id, a]));
  const t = byId.get(target.assetId);
  const r = byId.get(reference.assetId);
  if (!t || !r) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (t.kind !== "video" || r.kind !== "video") return NextResponse.json({ error: "Both clips must be video" }, { status: 400 });

  const measure = async (side: Side, s3Key: string, withAdjust: boolean) => {
    const span = Math.min(side.duration, SAMPLE_SEC);
    const startSec = side.srcIn + Math.max(0, (side.duration - span) / 2);
    const look = [
      ...(side.filter && FILTER_PRESETS[side.filter].ffmpeg ? [FILTER_PRESETS[side.filter].ffmpeg as string] : []),
      ...(withAdjust ? adjustFilters(side.adjust) : []),
    ];
    const url = await getAssetReadUrl(s3Key, 600);
    return averageStats(await measureColorStats(url, { startSec, durationSec: span, look }));
  };

  try {
    const [src, ref] = await Promise.all([measure(target, t.s3Key, false), measure(reference, r.s3Key, true)]);
    if (!src || !ref) return NextResponse.json({ error: "Couldn't read any frames from one of the clips." }, { status: 422 });
    return NextResponse.json({ adjust: matchAdjust(src, ref), target: src, reference: ref });
  } catch (err) {
    logger.error("editor-color-match", "colour measurement failed", err);
    return NextResponse.json({ error: "Couldn't measure the clips' colours — try again." }, { status: 500 });
  }
}

// Two ffmpeg passes per call; a person matches a handful of clips at a time.
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "editor:color-match" });
