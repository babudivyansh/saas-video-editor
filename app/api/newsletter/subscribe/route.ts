import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { sendNewsletterConfirmEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { recordMarketingEvent } from "@/lib/marketing-analytics";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    source: z
      .string()
      .max(48)
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
  })
  .strict();

function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// POST /api/newsletter/subscribe — public, unauthenticated double opt-in.
//
// Always returns an identical 200 whether the address is brand new, already
// pending, or already confirmed. Anything else turns this into an email
// enumeration oracle: "already subscribed" tells an attacker the address has an
// account here. The confirmation email is the only channel that reveals state,
// and it only reaches the address's actual owner.
async function handlePOST(req: NextRequest) {
  const rawBody = await req.json().catch(() => null);

  // Honeypot: a hidden field no human fills in. Stripped before validation so
  // .strict() doesn't reject it, then answered with the same generic 400 as a
  // real validation failure so a bot learns nothing from the response shape.
  const honeypotFilled = !!(rawBody && typeof rawBody === "object" && "hp" in rawBody && (rawBody as { hp?: unknown }).hp);
  if (rawBody && typeof rawBody === "object") delete (rawBody as { hp?: unknown }).hp;

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (honeypotFilled) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { email, source } = parsed.data;

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email },
    select: { status: true, token: true },
  });

  // Already confirmed: nothing to do, and deliberately no "you're already
  // subscribed" email — that would confirm the address to whoever typed it.
  if (existing?.status === "confirmed") {
    return NextResponse.json({ ok: true });
  }

  const token = existing?.token ?? newToken();

  if (existing) {
    // Covers the re-subscribe-after-unsubscribe case too: back to pending,
    // and they have to confirm again.
    await prisma.newsletterSubscriber.update({
      where: { email },
      data: { status: "pending", unsubscribedAt: null, ...(source && { source }) },
    });
  } else {
    await prisma.newsletterSubscriber.create({
      data: { email, token, ...(source && { source }) },
    });
  }

  const confirmUrl = `${env.NEXT_PUBLIC_APP_URL}/api/newsletter/confirm?t=${token}`;
  // Non-fatal: a mail failure must not turn into a 500 that tells the caller
  // their address was accepted-but-broken. They can resubmit.
  await sendNewsletterConfirmEmail(email, confirmUrl).catch((e) =>
    logger.error("newsletter:subscribe", "confirm email failed", e),
  );

  await recordMarketingEvent("newsletter_submit", { path: "/blog", placement: "newsletter" });

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, {
  limit: 5,
  windowSec: 300,
  keyBy: "ip",
  name: "newsletter:subscribe",
});
