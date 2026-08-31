// Verifies ElevenLabs' webhook signature — header `elevenlabs-signature`,
// format `t=<unix_seconds>,v1=<hex_hmac_sha256>`, computed over
// `${t}.${rawBody}`. Structurally the same shape as Razorpay's webhook
// (hex HMAC, raw body), not Resend's Svix-based scheme — see
// app/api/webhooks/razorpay/route.ts for the sibling pattern this mirrors.
//
// Whether ElevenLabs Dubbing specifically ever sends this webhook is
// unconfirmed (see app/api/webhooks/elevenlabs/route.ts's own doc comment)
// — this verifier is written against ElevenLabs' documented signature
// scheme regardless, since every webhook event type they DO document
// (post_call_transcription, voice_removed, etc.) uses the same header.

import crypto from "crypto";

const DEFAULT_TOLERANCE_SEC = 30 * 60; // ElevenLabs' documented tolerance is ~30 minutes

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_header" | "malformed_header" | "not_configured" | "bad_signature" | "stale_timestamp" };

export function verifyElevenLabsSignature(
  body: string,
  header: string | null,
  secret: string | undefined,
  now: Date = new Date(),
  toleranceSec = DEFAULT_TOLERANCE_SEC,
): VerifyResult {
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!header) return { ok: false, reason: "missing_header" };

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return { ok: false, reason: "malformed_header" };

  const ageSec = Math.abs(now.getTime() / 1000 - Number(timestamp));
  if (ageSec > toleranceSec) return { ok: false, reason: "stale_timestamp" };

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
