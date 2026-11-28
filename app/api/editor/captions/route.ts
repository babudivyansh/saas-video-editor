import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spendMinutes, restoreMinutes } from "@/lib/minutes";
import { billableCaptionMinutes } from "@/lib/autoclip-pricing";
import { extractAudio, probeMediaDuration } from "@/utils/ffmpeg-render";
import { transcribe } from "@/lib/transcription";
import { downloadFile } from "@/utils/download";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";
import { classifyCaptionFailure } from "@/lib/caption-failure";
import {
  getTranscriptionRuntimeHealth,
  TRANSCRIPTION_RUNTIME_UNAVAILABLE,
  TRANSCRIPTION_UNAVAILABLE_MESSAGE,
} from "@/lib/transcription-runtime";

// POST /api/editor/captions { assetId, languageCode?, fromSec?, toSec? }
// Transcribes a video asset from the user's library and returns word-level
// timings (source-time seconds). The client turns these into caption text
// clips aligned to wherever the clip sits on the timeline.
//
// Costs Clip Minutes — 1 per minute of the asset, rounded up (2026-09-26
// pricing model; it was a flat 1 credit). Speech-to-text is billed by length.
// With fromSec/toSec (source seconds) only that range is extracted,
// transcribed and billed, and word timings come back in whole-file time;
// without them the whole asset is used (Caption Studio). Charged after the length is known but before the paid provider
// call; refunded if transcription fails. languageCode is optional — omitted or
// "auto" lets Scribe auto-detect the spoken language (the previous, only
// behavior before the Caption panel's language selector existed).
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assetId = body.assetId as string | undefined;
  const languageCode = body.languageCode as string | undefined;
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
  const range = parseRange(body.fromSec, body.toSec);
  if (range === "invalid") return NextResponse.json({ error: "fromSec/toSec must be numbers with 0 <= fromSec < toSec" }, { status: 400 });

  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId: auth.userId } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  // Transcription runtime gate — BEFORE any credit is spent (P0-1).
  //
  // Previously an unusable runtime still charged a credit, downloaded the
  // media, extracted audio, called a provider, failed, and refunded. The
  // refund made it non-destructive but it was still selling a guaranteed
  // failure — the same pattern as the P0-2 ffmpeg outage. Network-free, so it
  // costs nothing per request, and only refuses on unambiguous
  // misconfiguration (nothing configured, or everything configured is
  // obviously malformed); a well-formed credential that the provider later
  // rejects still fails downstream and refunds exactly as before.
  const runtime = getTranscriptionRuntimeHealth();
  if (!runtime.ok) {
    logger.error("editor-captions", `${TRANSCRIPTION_RUNTIME_UNAVAILABLE} — refusing before charge`, {
      code: TRANSCRIPTION_RUNTIME_UNAVAILABLE,
      reason: runtime.reason,
      // Names and shape verdicts only — never credential values.
      providers: runtime.providers.map((p) => `${p.name}:${p.configured ? (p.shapeValid ? "ok" : `malformed(${p.shapeIssue})`) : "absent"}`),
      assetId,
    });
    return NextResponse.json(
      { error: TRANSCRIPTION_RUNTIME_UNAVAILABLE, message: TRANSCRIPTION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const spendRef = `editor-captions:${assetId}:${Date.now()}`;
  let charged = false;

  const tmp = os.tmpdir();
  const stamp = `captions-${auth.userId}-${Date.now()}`;
  const mediaPath = path.join(tmp, `${stamp}-src${path.extname(new URL(asset.url).pathname) || ".mp4"}`);
  const audioPath = path.join(tmp, `${stamp}.mp3`);

  try {
    // From the key, not asset.url: that column is the legacy unsigned URL,
    // which a private bucket answers with 403.
    await downloadFile(await getAssetReadUrl(asset.s3Key, 600), mediaPath);
    // The asset row's stored length when there is one, else probe the file.
    const fileSec = asset.duration ?? (await probeMediaDuration(mediaPath)).durationSec ?? 0;
    // A range past the end of the file is clamped to it.
    const clipped = range && fileSec > 0 ? { fromSec: Math.min(range.fromSec, fileSec), toSec: Math.min(range.toSec, fileSec) } : range;
    const durationSec = clipped ? Math.max(0, clipped.toSec - clipped.fromSec) : fileSec;
    const minutesNeeded = billableCaptionMinutes(durationSec);
    const spend = await spendMinutes({
      userId: auth.userId,
      amount: minutesNeeded,
      reason: "spend:editor-captions",
      refId: spendRef,
    });
    if (!spend.ok) {
      return NextResponse.json(
        {
          error: `Not enough Clip Minutes — captioning this video needs ${minutesNeeded} and you have ${spend.balances.total}.`,
          code: "insufficient_minutes",
          required: minutesNeeded,
          balance: spend.balances.total,
        },
        { status: 402 },
      );
    }
    charged = true;
    await extractAudio(mediaPath, audioPath, clipped ?? undefined);
    const offsetMs = Math.round((clipped?.fromSec ?? 0) * 1000);
    const words = (await transcribe(fs.readFileSync(audioPath), "audio/mpeg", languageCode)).map((w) =>
      offsetMs ? { ...w, start: w.start + offsetMs, end: w.end + offsetMs } : w,
    );
    if (words.length === 0) {
      throw new Error("No speech detected (or transcription unavailable)");
    }
    return NextResponse.json({ words, minutesCharged: minutesNeeded, minutesRemaining: spend.balances.total });
  } catch (err) {
    // Refund on failure — restores the exact buckets the spend drained.
    if (charged) {
      await restoreMinutes({ userId: auth.userId, refId: spendRef, reason: "refund:editor-captions-failed" }).catch(() => {});
    }
    // classification never throws and never echoes the raw error text (which
    // can be a third-party provider's full error body) back to the client —
    // the full message/stack still reaches engineering via logger.error ->
    // Sentry, tagged with the category for easy triage.
    const { category, userMessage } = classifyCaptionFailure(err);
    logger.error("editor-captions", `failed [${category}]`, err);
    return NextResponse.json({ error: userMessage }, { status: 500 });
  } finally {
    for (const f of [mediaPath, audioPath]) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}

/** Optional source-time range: both absent → null (whole file); both finite
 *  with 0 <= from < to → the range; anything else → "invalid". */
function parseRange(from: unknown, to: unknown): { fromSec: number; toSec: number } | null | "invalid" {
  if (from == null && to == null) return null;
  if (typeof from !== "number" || typeof to !== "number") return "invalid";
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) return "invalid";
  return { fromSec: from, toSec: to };
}

// Paid (Clip Minutes) and runs a full-asset transcription — a burst of these
// is never a person clicking.
export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "editor:captions" });
