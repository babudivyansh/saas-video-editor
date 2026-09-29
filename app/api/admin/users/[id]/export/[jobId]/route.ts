import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { getAccountExportStatus } from "@/lib/account-export";
import { auditAdminAction, auditOnce } from "@/lib/admin/audit";

// GET /api/admin/users/[id]/export/[jobId] — poll an admin-requested export.
// The job must belong to this user: a jobId from another account's export
// is refused, so the URL can't be used to read someone else's bundle.
export const GET = withAdmin<{ id: string; jobId: string }>(async (_req, { admin, params }) => {
  const status = await getAccountExportStatus(params.jobId);
  if (status.userId && status.userId !== params.id) {
    return NextResponse.json({ error: "This export belongs to a different account" }, { status: 403 });
  }
  // The first time the download link is handed out is when personal data
  // actually leaves — audited once per export.
  if (status.status === "ready" && (await auditOnce(`audit:export-dl:${params.jobId}`, 86400))) {
    await auditAdminAction(admin.userId, "user.data_export_downloaded", params.id, { after: { jobId: params.jobId } });
  }
  const { userId, ...publicStatus } = status;
  void userId;
  return NextResponse.json(publicStatus);
});
