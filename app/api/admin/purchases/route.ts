import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";

const CSV_BATCH = 1000;

export const GET = withAdmin(async (req) => {
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
    // Cursor-batched stream: exports of any size without loading every row
    // (previously a single unbounded findMany) or changing the file format.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode("ID,User Email,User Name,Plan,Kind,Amount (INR),Credits,Status,Date\n"));
        let cursor: string | undefined;
        for (;;) {
          const batch = await prisma.purchase.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: CSV_BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select,
          });
          if (batch.length === 0) break;
          const rows = batch
            .map((p) =>
              [
                p.id,
                p.user?.email ?? "",
                p.user?.name ?? "",
                p.plan?.name ?? "",
                p.plan?.kind ?? "",
                (p.amountInPaise / 100).toFixed(2),
                p.credits,
                p.status,
                new Date(p.createdAt).toISOString().split("T")[0],
              ]
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(","),
            )
            .join("\n");
          controller.enqueue(encoder.encode(rows + "\n"));
          if (batch.length < CSV_BATCH) break;
          cursor = batch[batch.length - 1].id;
        }
        controller.close();
      },
    });
    return new NextResponse(stream, {
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
});
