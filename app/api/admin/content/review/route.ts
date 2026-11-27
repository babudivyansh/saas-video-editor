import { NextResponse } from "next/server";
import { withAdmin, parseBody, parseQuery } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { reviewActionSchema, reviewQueueSchema } from "@/lib/admin/schemas";
import { applyReview, listReviewQueue, reviewCounts } from "@/lib/admin/content-review";

// GET /api/admin/content/review?kind=asset|clip&filter=flagged|pending|reviewed&cursor=
export const GET = withAdmin(async (req) => {
  const q = parseQuery(req, reviewQueueSchema);
  const [page, counts] = await Promise.all([listReviewQueue(q), reviewCounts()]);
  return NextResponse.json({ ...page, counts });
});

// POST /api/admin/content/review { kind, id, action: approve|remove, reason }
// approve marks it watched (and returns a flagged upload to its owner);
// remove deletes it and its stored files. Audited either way.
export const POST = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, reviewActionSchema);
  const result = await applyReview(body.kind, body.id, body.action, admin.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await auditAdminAction(admin.userId, body.action === "approve" ? "content.review_approved" : "content.review_removed", result.ownerId, {
    before: { kind: body.kind, id: body.id, ...result.before },
    after: body.action === "approve" ? { reviewed: true } : { deleted: true },
    reason: body.reason,
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true });
});
