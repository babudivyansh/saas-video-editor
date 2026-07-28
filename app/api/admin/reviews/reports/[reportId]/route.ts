import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";

const reportActionSchema = z.object({ action: z.enum(["resolve", "dismiss"]) }).strict();

// POST /api/admin/reviews/reports/[reportId]  body: { action: resolve|dismiss }
export const POST = withAdmin<{ reportId: string }>(async (req, { admin, params }) => {
  const { reportId } = params;
  const { action } = await parseBody(req, reportActionSchema);

  const report = await prisma.reviewReport.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (report.status !== "open") return NextResponse.json({ error: "Report already handled" }, { status: 409 });

  const status = action === "resolve" ? "reviewed" : "dismissed";
  const updated = await prisma.reviewReport.update({
    where: { id: reportId },
    data: { status, reviewedBy: admin.userId, reviewedAt: new Date() },
  });

  await auditAdminAction(admin.userId, `review.report_${action === "resolve" ? "resolved" : "dismissed"}`, report.reviewId, {
    before: { status: report.status },
    after: { status },
    ip: auditIp(req),
  });

  return NextResponse.json({ report: updated });
});
