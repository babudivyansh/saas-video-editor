import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendFeatureAnnouncementEmail, sendNewsletterBroadcastEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Daily cron — sends every published-but-unsent FeatureAnnouncement (see
// app/api/admin/announcements) to all active users. Per-recipient opt-out is
// enforced by sendTemplate itself (lib/email/send.ts checks shouldSendCategory
// once a userId is passed), not re-implemented here.
//
//   GET /api/cron/feature-announcements
//   Authorization: Bearer <CRON_SECRET>
//
// Known scaling limit: loads the full active-user table into memory, the same
// tradeoff app/api/cron/reengagement already makes — fine at this user base's
// current size, would need cursor-based batching well before it isn't.
export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void import("@/lib/cron-tracking").then((m) => m.recordCronRun("feature-announcements")).catch(() => {});

  const due = await prisma.featureAnnouncement.findMany({
    where: { publishedAt: { not: null }, sentAt: null },
    orderBy: { publishedAt: "asc" },
  });

  const results: { announcementId: string; sent: number; errors: number }[] = [];

  if (due.length > 0) {
    // Fetched once outside the loop — the recipient pool (active users) is the
    // same for every due announcement; only the per-user opt-out check
    // (inside sendTemplate) varies by audience.
    const recipients = await prisma.user.findMany({
      where: { deactivatedAt: null, suspendedAt: null },
      select: { id: true, email: true, firstName: true, name: true },
    });

    for (const a of due) {
      const sendFn = a.audience === "newsletter" ? sendNewsletterBroadcastEmail : sendFeatureAnnouncementEmail;
      let sent = 0;
      let errors = 0;

      for (const u of recipients) {
        try {
          const delivered = await sendFn(u.email, u.id, {
            name: u.firstName ?? u.name ?? "",
            title: a.title,
            body: a.body,
            ctaLabel: a.ctaLabel,
            ctaUrl: a.ctaUrl,
          });
          if (delivered) sent++;
        } catch (e) {
          errors++;
          logger.error("cron/feature-announcements", `send failed for ${u.id} on announcement ${a.id}`, e);
        }
      }

      // Marked sent even if some individual recipients errored — retrying the
      // whole announcement on the next run would re-mail everyone who DID
      // already receive it. This is a broadcast, not a transactional receipt,
      // so "mostly delivered, failures logged above" is the right outcome.
      await prisma.featureAnnouncement.update({
        where: { id: a.id },
        data: { sentAt: new Date(), recipientCount: sent },
      });

      results.push({ announcementId: a.id, sent, errors });
    }
  }

  return NextResponse.json({ ok: true, processed: due.length, results, at: new Date().toISOString() });
}
