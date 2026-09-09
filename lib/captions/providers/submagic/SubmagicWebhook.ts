// Webhook authentication for caption-render callbacks.
//
// Submagic's documented webhook support is a plain `webhookUrl` on the project
// with NO described signing scheme, so unlike Razorpay (HMAC) or Resend (Svix)
// there is nothing to verify against yet. Rather than pretend otherwise, this
// implements the strongest thing actually available and leaves a signature path
// switched off but ready:
//
//   1. an unguessable token in the URL path (SUBMAGIC_WEBHOOK_TOKEN), compared
//      in constant time — the primary authenticator today;
//   2. correlation: the payload's project id must match a CaptionRenderJob we
//      created, so an attacker needs a real provider id as well as the token;
//   3. an expected-state check: a callback for a job already in a terminal
//      state is ignored;
//   4. and — the real backstop — the worker re-reads the provider's own API
//      before acting on anything. NOTHING in the payload except the project id
//      is ever trusted, so a forged callback cannot advance a job's state,
//      fabricate an output URL, or make us spend money.
//
// If Submagic ships signed webhooks, set SUBMAGIC_WEBHOOK_SECRET and (2) below
// starts additionally requiring a valid signature. The VerifyResult shape
// deliberately matches lib/elevenlabs-webhook.ts's.

import crypto from "crypto";
import { env } from "@/lib/env";

export type WebhookVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "bad_token" | "missing_signature" | "bad_signature" | "stale_timestamp";
    };

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Length must be compared separately — timingSafeEqual throws on a mismatch.
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Checks the path token.
 *
 * Fails CLOSED when unset: with no token configured there is nothing to prove
 * a caller is the provider, so every request is rejected. That is the same
 * posture as the Resend and ElevenLabs verifiers.
 */
export function verifyWebhookToken(token: string | undefined): WebhookVerifyResult {
  const expected = env.SUBMAGIC_WEBHOOK_TOKEN;
  if (!expected) return { ok: false, reason: "not_configured" };
  if (!token || !timingSafeEqualStr(token, expected)) return { ok: false, reason: "bad_token" };
  return { ok: true };
}

/**
 * Optional HMAC layer, inert until SUBMAGIC_WEBHOOK_SECRET is set.
 *
 * Written against the `t=<unix>,v1=<hex>` convention ElevenLabs and Stripe both
 * use, since that is the most likely shape. CONFIRM THE REAL SCHEME against a
 * live test webhook before relying on it — turning this on against a guessed
 * format would reject every genuine callback.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  now: Date = new Date(),
  toleranceSec = 30 * 60,
): WebhookVerifyResult {
  const secret = env.SUBMAGIC_WEBHOOK_SECRET;
  // Not configured is not a failure here — the token is doing the work.
  if (!secret) return { ok: true };

  if (!header) return { ok: false, reason: "missing_signature" };

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return { ok: false, reason: "bad_signature" };

  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > toleranceSec) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!timingSafeEqualStr(signature, expected)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

/**
 * Pulls the provider project id out of a callback.
 *
 * The ONLY field ever read from the payload. Status, URLs and durations are
 * deliberately ignored here — the worker re-reads them from the provider's API,
 * which is what keeps this route resilient to both payload-shape drift and
 * outright forgery.
 */
export function extractProviderProjectId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates = [p.projectId, p.project_id, p.id];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0 && c.length <= 128) return c;
  }
  // Some providers nest it one level down.
  const data = p.data;
  if (data && typeof data === "object") return extractProviderProjectId(data);
  return null;
}
