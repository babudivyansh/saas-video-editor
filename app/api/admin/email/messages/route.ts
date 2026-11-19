import { NextResponse } from "next/server";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { emailMessagesQuerySchema } from "@/lib/admin/schemas";
import { listEmailMessages, resolveRange } from "@/lib/email/router/admin-queries";

// Email activity table. Recipients are masked server-side; no bodies, no codes.
export const GET = withAdmin(async (req) => {
  const q = parseQuery(req, emailMessagesQuerySchema);
  const range = q.range === "all" ? null : resolveRange(q.range, q.from, q.to);
  return NextResponse.json(await listEmailMessages({
    q: q.q || undefined, status: q.status, provider: q.provider, templateId: q.templateId || undefined,
    priority: q.priority, from: range?.from, to: range?.to, sort: q.sort, page: q.page, pageSize: q.pageSize,
  }));
});
