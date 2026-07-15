// Single audit-trail helper for admin actions. Uses the existing AuditLog
// columns unchanged — reason and IP travel inside the `after` JSON as `_meta`
// (the audit viewer already renders before/after as raw JSON, so no UI or
// migration work). Never throws: an audit failure must not fail the action,
// but it IS logged, unlike the old silent-swallow behavior.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/rate-limit";

export interface AuditDetails {
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
}

export async function auditAdminAction(
  adminId: string,
  action: string,
  targetId?: string,
  details?: AuditDetails,
): Promise<void> {
  try {
    const meta: Record<string, string> = {};
    if (details?.reason) meta.reason = details.reason;
    if (details?.ip) meta.ip = details.ip;
    const after =
      details?.after !== undefined || Object.keys(meta).length > 0
        ? JSON.stringify(
            Object.keys(meta).length > 0
              ? { ...(details?.after && typeof details.after === "object" ? details.after : { value: details?.after }), _meta: meta }
              : details?.after,
          )
        : null;
    await prisma.auditLog.create({
      data: {
        adminId,
        action,
        targetId: targetId ?? null,
        before: details?.before !== undefined ? JSON.stringify(details.before) : null,
        after,
      },
    });
  } catch (e) {
    logger.warn("audit", `audit write failed for ${action} on ${targetId ?? "-"}`, {
      reason: (e as Error).message,
    });
  }
}

// Best-effort request IP for the audit _meta.
export function auditIp(req: NextRequest): string | undefined {
  const ip = getClientIp(req);
  return ip === "unknown" ? undefined : ip;
}
