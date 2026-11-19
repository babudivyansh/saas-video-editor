import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { applyAll, parseMailjetEvent, verifySharedSecret, type DeliveryEvent } from "@/lib/email/router/webhooks";

// Mailjet event API (sent, bounce, blocked, spam…).
//
// Mailjet's only documented protection is Basic auth embedded in the URL:
// set the event URL to https://mailjet:<MAILJET_WEBHOOK_SECRET>@clipiro.com/api/webhooks/mailjet
// (Account → Event notifications). Unset secret = every request refused.
// Mailjet retries any non-200 every 30s for 24h, and may batch events into
// an array when "group events" is on — both handled.
export async function POST(req: NextRequest) {
  if (!verifySharedSecret(req.headers.get("authorization"), env.MAILJET_WEBHOOK_SECRET)) {
    logger.warn("webhook:mailjet", "rejected (bad or missing credentials)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const items = (Array.isArray(raw) ? raw : [raw]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const events = items.map(parseMailjetEvent).filter((e): e is DeliveryEvent => e !== null);
  // Mailjet's "test URL" button posts an empty/odd body: acknowledge it, since
  // a 4xx there would just make Mailjet retry for a day.
  if (events.length === 0) return NextResponse.json({ ok: true, ignored: true });

  try {
    const tally = await applyAll(events, "webhook:mailjet");
    return NextResponse.json({ ok: true, ...tally });
  } catch {
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
