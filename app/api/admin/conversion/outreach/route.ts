import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { rateLimit } from "@/lib/rate-limit";
import { csvBody, csvFilename, type CsvRow } from "@/lib/social/csv";
import { LOW_MINUTES_OFFER_AT } from "@/lib/conversion";

// GET /api/admin/conversion/outreach — who to talk to by hand (conversion plan
// 2026-11-26, Phase 5), as CSV:
//   heavy        the 10 accounts that have run the most source minutes
//   nearly_out   free accounts that have run AutoClip and have ≤5 minutes left
//   hit_limit    accounts shown the "over your plan's limit" offer (from 26 Nov)
//   payer        everyone who has paid (ask why they did)
// An account appears once, under the first segment it fits. Personal data
// leaving the panel: rate-limited and audit-logged like the Users export.
// The email to send them is in docs/conversion/outreach.md.

const HEADER = [
  "segment", "user_id", "email", "name", "signed_up_at", "intended_use",
  "minutes_used", "minutes_left", "autoclip_runs", "paid_inr", "last_login_at",
];

export const GET = withAdmin(async (req, { admin }) => {
  const limit = await rateLimit(`admin-outreach-export:${admin.userId}`, 5, 600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many exports. Try again in a few minutes." }, { status: 429 });

  const base = { role: "USER" as const, purgedAt: null, deactivatedAt: null };

  const spent = await prisma.minuteTransaction.groupBy({
    by: ["userId"],
    where: { reason: "spend:auto-clip", delta: { lt: 0 }, user: base },
    _sum: { delta: true },
  });
  const usedBy = new Map(spent.map((r) => [r.userId, -(r._sum.delta ?? 0)]));
  const heavy = [...usedBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);

  const nearlyOut = (
    await prisma.user.findMany({
      where: { ...base, id: { in: [...usedBy.keys()] }, minutes: { lte: LOW_MINUTES_OFFER_AT }, planId: null },
      select: { id: true },
    })
  ).map((u) => u.id);

  const hitLimit = (
    await prisma.userEvent.findMany({
      where: { type: "upgrade_prompt", meta: { path: ["placement"], equals: "file_limit" }, user: base },
      select: { userId: true },
      distinct: ["userId"],
    })
  ).map((e) => e.userId);

  const paid = await prisma.purchase.groupBy({
    by: ["userId"],
    where: { status: "captured", amountInPaise: { gt: 0 }, currency: "INR", user: base },
    _sum: { amountInPaise: true },
  });
  const paidBy = new Map(paid.map((p) => [p.userId, (p._sum.amountInPaise ?? 0) / 100]));
  const payers = (
    await prisma.purchase.findMany({
      where: { status: "captured", amountInPaise: { gt: 0 }, user: base },
      select: { userId: true },
      distinct: ["userId"],
    })
  ).map((p) => p.userId);

  const segmentOf = new Map<string, string>();
  for (const [segment, ids] of [["heavy", heavy], ["nearly_out", nearlyOut], ["hit_limit", hitLimit], ["payer", payers]] as const) {
    for (const id of ids) if (!segmentOf.has(id)) segmentOf.set(id, segment);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...segmentOf.keys()] } },
    select: {
      id: true, email: true, name: true, createdAt: true, intendedUse: true, minutes: true, lastLoginAt: true,
      _count: { select: { projects: { where: { productType: "auto-clip", status: { not: "draft" } } } } },
    },
  });
  const order = ["heavy", "nearly_out", "hit_limit", "payer"];
  users.sort((a, b) => order.indexOf(segmentOf.get(a.id)!) - order.indexOf(segmentOf.get(b.id)!) || (usedBy.get(b.id) ?? 0) - (usedBy.get(a.id) ?? 0));

  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const rows: CsvRow[] = users.map((u) => [
    segmentOf.get(u.id), u.id, u.email, u.name, iso(u.createdAt), u.intendedUse,
    usedBy.get(u.id) ?? 0, u.minutes, u._count.projects, (paidBy.get(u.id) ?? 0).toFixed(2), iso(u.lastLoginAt),
  ]);

  await auditAdminAction(admin.userId, "users.exported", undefined, {
    after: { rows: rows.length, filters: { list: "conversion-outreach" } },
    ip: auditIp(req),
  });

  return new NextResponse(csvBody(HEADER, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(["clipiro-outreach", new Date().toISOString().slice(0, 10)])}"`,
      "Cache-Control": "no-store",
    },
  });
});
