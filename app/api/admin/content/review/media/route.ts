import { NextResponse } from "next/server";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { reviewMediaSchema } from "@/lib/admin/schemas";
import { reviewMedia } from "@/lib/admin/content-review";

// GET /api/admin/content/review/media?kind=asset|clip&id= — a short-lived
// signed URL so an admin can watch a user's upload or clip. Media is private
// (presigned reads only), so each view is audited against the owner.
export const GET = withAdmin(async (req, { admin }) => {
  const { kind, id } = parseQuery(req, reviewMediaSchema);
  const media = await reviewMedia(kind, id);
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await auditAdminAction(admin.userId, "content.media_viewed", media.ownerId, { after: { kind, id }, ip: auditIp(req) });
  return NextResponse.json({ url: media.url, mimeType: media.mimeType });
});
