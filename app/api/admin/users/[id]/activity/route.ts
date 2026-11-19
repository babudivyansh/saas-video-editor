import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { getUserActivitySummary, getUserTimeline } from "@/lib/admin/user-activity";

// GET /api/admin/users/:id/activity?before=<ISO>&limit=<n>
// The user detail page's activity timeline (lib/admin/user-activity.ts). The
// first page also carries the per-user totals; later pages are items only.
export const GET = withAdmin<{ id: string }>(async (req, { params }) => {
  const { searchParams } = new URL(req.url);
  const beforeRaw = searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : undefined;
  if (before && Number.isNaN(before.getTime())) {
    return NextResponse.json({ error: "Invalid before" }, { status: 400 });
  }
  const limit = Number(searchParams.get("limit") ?? 50) || 50;

  const [page, summary] = await Promise.all([
    getUserTimeline(params.id, { limit, before }),
    before ? Promise.resolve(null) : getUserActivitySummary(params.id),
  ]);
  return NextResponse.json({ ...page, ...(summary ? { summary } : {}) });
});
