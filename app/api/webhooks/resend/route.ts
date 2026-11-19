import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { suppress } from "@/lib/email/suppression";
import { applyAll, parseResendDelivery } from "@/lib/email/router/webhooks";
import { parseResendEvent, verifySvixSignature, type ResendEvent } from "@/lib/email/resend-webhook";

// Bounce and complaint feedback from Resend.
//
// Without this there was no feedback loop at all: a dead address stayed in the
// user table and every cron mailed it again, forever. That is the fastest way to
// lose sending reputation, and it is invisible until deliverability collapses.
//
// Configure at https://resend.com/webhooks for email.sent, email.delivered,
// email.delivery_delayed, email.bounced, email.complained and email.failed,
// pointing at /api/webhooks/resend.

export async function POST(req: NextRequest) {
  // The raw body, not req.json() — the signature covers the exact bytes sent,
  // and re-serializing a parsed object would not reproduce them.
  const body = await req.text();

  const result = verifySvixSignature(
    body,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    env.RESEND_WEBHOOK_SECRET,
  );

  if (!result.ok) {
    // 401 rather than 400: this is an authentication failure, and Resend retries
    // on 5xx but not on 4xx, so a genuinely unsigned caller is not retried.
    logger.warn("webhook:resend", `rejected (${result.reason})`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Shared with the Brevo/Mailjet routes (lib/email/router/webhooks.ts):
  // deduped on the svix-id, moves the EmailMessage status forward only,
  // updates EmailLog, and suppresses on a hard bounce or complaint.
  const delivery = parseResendDelivery(req.headers.get("svix-id") ?? "", event as Parameters<typeof parseResendDelivery>[1]);
  if (!delivery || delivery.kind === "ignored") {
    // Acknowledged deliberately. Returning an error for an event type we simply
    // do not act on would make Resend retry it and eventually disable the hook.
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  try {
    await applyAll([delivery], "webhook:resend");
  } catch {
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  // A message to several recipients (none today) — suppress every one, as before.
  const parsed = parseResendEvent(event);
  if (parsed.permanent) {
    const reason = parsed.kind === "complained" ? "complaint" : "hard_bounce";
    for (const address of parsed.recipients.slice(1)) {
      await suppress(address, reason, event.type);
    }
  }

  return NextResponse.json({ ok: true });
}
