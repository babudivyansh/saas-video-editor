import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { getAccountExportStatus } from "@/lib/account-export";

// GET /api/admin/users/[id]/export/[jobId] — poll an admin-requested export.
// The job must belong to this user: a jobId from another account's export
// is refused, so the URL can't be used to read someone else's bundle.
export const GET = withAdmin<{ id: string; jobId: string }>(async (_req, { params }) => {
  const status = await getAccountExportStatus(params.jobId);
  if (status.userId && status.userId !== params.id) {
    return NextResponse.json({ error: "This export belongs to a different account" }, { status: 403 });
  }
  const { userId, ...publicStatus } = status;
  void userId;
  return NextResponse.json(publicStatus);
});
