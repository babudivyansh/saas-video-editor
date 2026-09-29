import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { assetModerateSchema } from "@/lib/admin/schemas";
import { deleteContent } from "@/lib/admin/content";

// POST /api/admin/content/moderate  { assetId, action: approve|remove, reason }
// Resolves one asset the moderation scan flagged. approve marks it clean (it
// reappears in the owner's library); remove deletes it and its stored files.
export const POST = withAdmin(async (req, { admin }) => {
  const { assetId, action, reason } = await parseBody(req, assetModerateSchema);
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, userId: true, name: true, moderationStatus: true } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  if (action === "approve") {
    await prisma.asset.update({ where: { id: assetId }, data: { moderationStatus: "clean" } });
  } else {
    await deleteContent("asset", [assetId]);
  }
  await auditAdminAction(admin.userId, `asset.moderation_${action}`, assetId, {
    before: { moderationStatus: asset.moderationStatus, userId: asset.userId, name: asset.name },
    after: action === "approve" ? { moderationStatus: "clean" } : { deleted: true },
    reason,
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true });
});
