import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";

export const GET = withAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const skip  = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        adminId: true,
        action: true,
        targetId: true,
        before: true,
        after: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count(),
  ]);

  // Resolve admin email for display
  const adminIds = [...new Set(logs.map((l) => l.adminId))];
  const admins = adminIds.length
    ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true, name: true } })
    : [];
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.email]));

  const enriched = logs.map((l) => ({ ...l, adminEmail: adminMap[l.adminId] ?? l.adminId }));

  return NextResponse.json({ logs: enriched, total, page, limit });
});
