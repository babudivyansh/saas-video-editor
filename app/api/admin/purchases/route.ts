import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const exportCsv = searchParams.get("export") === "csv";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit    = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const skip     = (page - 1) * limit;
  const search   = searchParams.get("search")?.trim() ?? "";
  const planSlug = searchParams.get("planSlug")?.trim() ?? "";
  const status   = searchParams.get("status")?.trim() ?? "";
  const from     = searchParams.get("from");
  const to       = searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (search) {
    where.user = { OR: [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] };
  }
  if (planSlug) where.plan = { slug: planSlug };
  if (status)   where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to + "T23:59:59Z") } : {}),
    };
  }

  const select = {
    id: true,
    amountInPaise: true,
    credits: true,
    status: true,
    createdAt: true,
    user: { select: { id: true, email: true, name: true } },
    plan: { select: { name: true, slug: true, kind: true } },
  };

  if (exportCsv) {
    const all = await prisma.purchase.findMany({ where, orderBy: { createdAt: "desc" }, select });
    const header = "ID,User Email,User Name,Plan,Kind,Amount (INR),Credits,Status,Date";
    const rows = all.map(p => [
      p.id,
      p.user?.email ?? "",
      p.user?.name ?? "",
      p.plan?.name ?? "",
      p.plan?.kind ?? "",
      (p.amountInPaise / 100).toFixed(2),
      p.credits,
      p.status,
      new Date(p.createdAt).toISOString().split("T")[0],
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="purchases-${Date.now()}.csv"`,
      },
    });
  }

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, select }),
    prisma.purchase.count({ where }),
  ]);

  return NextResponse.json({ purchases, total, page, limit });
}
