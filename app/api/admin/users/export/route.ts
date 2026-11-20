import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { rateLimit } from "@/lib/rate-limit";
import { buildUserWhere } from "@/lib/admin/user-filters";
import { AUTOCLIP } from "@/lib/admin/staff-digest";
import { csvBody, csvFilename, type CsvRow } from "@/lib/social/csv";

// GET /api/admin/users/export?<same filters as the list> — the filtered
// Admin → Users list as CSV. Personal data leaving the panel, so it is
// rate-limited and every export is in the audit log with its filters and row
// count. No payment details beyond amounts; no IPs.

const MAX_EXPORT_ROWS = 10_000;
const FILTER_KEYS = ["search", "filter", "journey", "joined", "method", "use", "active"];

const HEADER = [
  "user_id", "email", "name", "signed_up_at", "signup_method", "intended_use",
  "came_from", "first_page", "campaign", "plan", "subscription_ends_at",
  "last_login_at", "role", "suspended", "autoclip_runs", "paid_inr", "payments",
];

export const GET = withAdmin(async (req, { admin }) => {
  const limit = await rateLimit(`admin-users-export:${admin.userId}`, 5, 600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many exports. Try again in a few minutes." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const where = buildUserWhere(searchParams);
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_ROWS,
    select: {
      id: true, email: true, name: true, createdAt: true, hasPassword: true, intendedUse: true,
      signupReferrer: true, signupLandingPath: true, signupSource: true,
      subscriptionEndsAt: true, lastLoginAt: true, role: true, suspendedAt: true,
      plan: { select: { name: true } },
      _count: { select: { projects: { where: { productType: AUTOCLIP } } } },
    },
  });

  const paid = users.length
    ? await prisma.purchase.groupBy({
        by: ["userId"],
        where: { userId: { in: users.map((u) => u.id) }, status: "captured", currency: "INR", amountInPaise: { gt: 0 } },
        _sum: { amountInPaise: true },
        _count: { _all: true },
      })
    : [];
  const paidBy = new Map(paid.map((p) => [p.userId, p]));

  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const rows: CsvRow[] = users.map((u) => {
    const p = paidBy.get(u.id);
    return [
      u.id, u.email, u.name, iso(u.createdAt), u.hasPassword ? "email" : "google", u.intendedUse,
      u.signupReferrer, u.signupLandingPath, u.signupSource, u.plan?.name ?? "Starter",
      iso(u.subscriptionEndsAt), iso(u.lastLoginAt), u.role, u.suspendedAt ? "yes" : "no", u._count.projects,
      p ? ((p._sum.amountInPaise ?? 0) / 100).toFixed(2) : "0.00", p?._count._all ?? 0,
    ];
  });

  const filters = Object.fromEntries(FILTER_KEYS.flatMap((k) => (searchParams.get(k) ? [[k, searchParams.get(k)]] : [])));
  await auditAdminAction(admin.userId, "users.exported", undefined, {
    after: { rows: users.length, truncated: users.length === MAX_EXPORT_ROWS, filters },
    ip: auditIp(req),
  });

  return new NextResponse(csvBody(HEADER, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(["clipiro-users", new Date().toISOString().slice(0, 10)])}"`,
      "Cache-Control": "no-store",
    },
  });
});
