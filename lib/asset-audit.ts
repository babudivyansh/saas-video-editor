// User-facing counterpart to lib/admin/audit.ts's auditAdminAction — one row
// per asset action (upload/rename/archive/restore/delete/bulk-*/moderation
// flag) so a user's asset history is reconstructable and support/abuse
// review has a trail. Never throws: an audit-write failure must not fail the
// underlying action, but it is logged, not silently swallowed.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type AssetAuditAction =
  | "upload"
  | "rename"
  | "archive"
  | "restore"
  | "delete"
  | "bulk_archive"
  | "bulk_restore"
  | "bulk_delete"
  | "bulk_move"
  | "bulk_tag"
  | "bulk_favorite"
  | "moderation_flagged"
  | "moderation_cleared";

export async function auditAssetAction(
  userId: string,
  action: AssetAuditAction,
  assetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.assetAuditLog.create({
      data: {
        userId,
        action,
        assetId: assetId ?? null,
        metadata: metadata ? (metadata as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (e) {
    logger.warn("asset-audit", `audit write failed for ${action} on ${assetId ?? "-"}`, {
      reason: (e as Error).message,
    });
  }
}
