import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { applyAll, parseBrevoEvent, verifySharedSecret, type DeliveryEvent } from "@/lib/email/router/webhooks";

// Brevo transactional delivery events (delivered, bounces, blocked, spam…).
//
// Brevo does not sign payloads. Create the webhook (Brevo → Transactional →
// Settings → Webhook, or POST /v3/webhooks) with token authentication set to
// BREVO_WEBHOOK_SECRET — Brevo then sends `Authorization: Bearer <token>` —
// or with Basic auth whose password is that secret. Unset secret = every
// request refused, because a forged "hard_bounce" would suppress a real user.
export async function POST(req: NextRequest) {
  if (!verifySharedSecret(req.headers.get("authorization"), env.BREVO_WEBHOOK_SECRET)) {
    logger.warn("webhook:brevo", "rejected (bad or missing credentials)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const items = (Array.isArray(raw) ? raw : [raw]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const events = items.map(parseBrevoEvent).filter((e): e is DeliveryEvent => e !== null);
  if (events.length === 0) return NextResponse.json({ error: "No events" }, { status: 400 });

  try {
    const tally = await applyAll(events, "webhook:brevo");
    return NextResponse.json({ ok: true, ...tally });
  } catch {
    // 5xx so Brevo retries; the dedupe table lets the retry re-apply safely.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
