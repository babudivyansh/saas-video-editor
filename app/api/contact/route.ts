import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendContactMessageEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";

const SUBJECT_LABELS = {
  support: "Technical support / account issues",
  billing: "Billing & refund inquiry",
  affiliate: "Affiliate program questions",
  feedback: "Product feedback & suggestions",
} as const;

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    subject: z.enum(["support", "billing", "affiliate", "feedback"]),
    message: z.string().trim().min(1).max(5000),
  })
  .strict();

// POST /api/contact — public, unauthenticated. The /contact page's form
// previously had no route to submit to at all (a fake setTimeout success
// state). No DB persistence — this is a notification to staff, not a record
// the app needs its own copy of, same reasoning as the newsletter/admin-digest
// emails; every ADMIN user gets it, mirroring the admin-recipient loop in
// app/api/cron/admin-digest/route.ts.
async function handlePOST(req: NextRequest) {
  const rawBody = await req.json().catch(() => null);

  // Honeypot: a hidden field no human fills in. Stripped before validation so
  // .strict() doesn't reject it, then answered with the same generic 400 as a
  // real validation failure so a bot learns nothing from the response shape.
  const honeypotFilled = !!(rawBody && typeof rawBody === "object" && "hp" in rawBody && (rawBody as { hp?: unknown }).hp);
  if (rawBody && typeof rawBody === "object") delete (rawBody as { hp?: unknown }).hp;

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success || honeypotFilled) {
    return NextResponse.json({ error: "Please fill in all the required fields." }, { status: 400 });
  }

  const { name, email, subject, message } = parsed.data;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });

  // Non-fatal per admin: one broken inbox must not turn this into a 500 that
  // tells the visitor their message was rejected when it may have reached
  // everyone else.
  await Promise.all(
    admins.map((a) =>
      sendContactMessageEmail(a.email, { name, email, subjectLabel: SUBJECT_LABELS[subject], message }).catch((e) =>
        logger.error("contact", `send failed for ${a.email}`, e),
      ),
    ),
  );

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 5, windowSec: 300, keyBy: "ip", name: "contact" });
