import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { reviewSettingsPatchSchema } from "@/lib/admin/schemas";
import { getReviewSettings, updateReviewSettings } from "@/lib/reviews/settings";

export const GET = withAdmin(async () => {
  const settings = await getReviewSettings();
  return NextResponse.json({ settings });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const patch = await parseBody(req, reviewSettingsPatchSchema);
  const before = await getReviewSettings();
  const settings = await updateReviewSettings(patch);
  await auditAdminAction(admin.userId, "review.settings_updated", undefined, { before, after: settings, ip: auditIp(req) });
  return NextResponse.json({ settings });
});
