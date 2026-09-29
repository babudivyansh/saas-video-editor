import { NextResponse } from "next/server";
import { withAdmin, parseBody, parseQuery } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { contentDeleteSchema, contentQuerySchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";
import { deleteContent, listContent } from "@/lib/admin/content";

// GET /api/admin/content?kind=project|asset&userId=&search=&filter=&cursor=
export const GET = withAdmin(async (req) => {
  return NextResponse.json(await listContent(parseQuery(req, contentQuerySchema)));
});

// POST /api/admin/content — permanently delete projects or assets, S3 objects
// included. Needs confirmPhrase "DELETE" and a reason; audited per call.
export const POST = withAdmin(async (req, { admin }) => {
  const { kind, ids, userId, reason } = await parseBody(req, contentDeleteSchema);
  const { allowed } = await rateLimit(`admin-content-delete:${admin.userId}`, 30, 900);
  if (!allowed) return NextResponse.json({ error: "Too many deletes — wait a few minutes" }, { status: 429 });

  const result = await deleteContent(kind, ids, userId);
  await auditAdminAction(admin.userId, `content.${kind}_deleted`, userId, {
    after: { ids, ...result },
    reason,
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true, ...result });
});
