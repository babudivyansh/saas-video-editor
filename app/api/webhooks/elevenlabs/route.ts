import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyElevenLabsSignature } from "@/lib/elevenlabs-webhook";
import { claimAndEnqueueFinish } from "@/lib/autoclip-dub";

// One route for all ElevenLabs webhook events (branches internally on the
// payload shape), matching the razorpay/resend one-route-per-service
// pattern, rather than a dubbing-specific route — so a future event type
// (ElevenLabs' documented ones today: post_call_transcription,
// voice_removal_notice, voice_removal_notice_withdrawn, voice_removed)
// doesn't need its own route + its own secret.
//
// ⚠ Whether ElevenLabs Dubbing actually sends a completion webhook at all is
// UNCONFIRMED as of this writing — their publicly documented webhook event
// list does not include one, and their documented POST /v1/dubbing request
// body has no webhook/callback parameter. This route is written against
// their confirmed signature scheme and is completely inert unless and until
// a dub-completion webhook is registered in the ElevenLabs dashboard AND
// ELEVENLABS_WEBHOOK_SECRET is set — until then, lib/cron/dub-sweep.ts is
// the only thing that ever finishes a dub. Confirm in the ElevenLabs
// dashboard (Developers → Webhooks) before relying on this path.
//
// Only `dubbing_id` is ever trusted from the payload — never a status field.
// finishDubJob re-verifies completion directly against ElevenLabs before
// doing any work, so this route stays resilient to payload-shape
// uncertainty (the exact field path for extracting dubbing_id below is a
// best guess pending that same dashboard confirmation).
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("elevenlabs-signature");

  const verified = verifyElevenLabsSignature(body, sig, env.ELEVENLABS_WEBHOOK_SECRET);
  if (!verified.ok) {
    logger.warn("elevenlabs-webhook", `signature check failed: ${verified.reason}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Best-guess field path — confirm the real payload shape against a live
  // test webhook before depending on this in production.
  const dubbingId = (event.data?.dubbing_id ?? event.data?.dubbingId) as string | undefined;
  if (!dubbingId) {
    // Not a dubbing event this route knows how to handle (or a shape we
    // didn't anticipate) — 200, never 4xx/5xx, so ElevenLabs doesn't back
    // off or auto-disable the endpoint over an event we simply don't act on.
    return NextResponse.json({ received: true });
  }

  const dub = await prisma.clipDub.findUnique({ where: { dubbingId }, include: { clip: true } });
  if (!dub) {
    logger.warn("elevenlabs-webhook", `no ClipDub found for dubbingId ${dubbingId}`);
    return NextResponse.json({ received: true });
  }

  // Enqueue only — the heavy work (download/translate/align/burn-in/upload)
  // runs on the queue's own worker pool, not inline in this request handler.
  await claimAndEnqueueFinish(dub).catch((e) =>
    logger.error("elevenlabs-webhook", `claimAndEnqueueFinish failed for ${dub.id}`, e),
  );

  return NextResponse.json({ received: true });
}
