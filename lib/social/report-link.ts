// Verification for a public report link.
//
// Three gates, in this order, and the order is the design:
//   1. JWT signature + expiry — cheap, and rejects junk without a query.
//   2. Redis denylist        — makes revocation INSTANT rather than eventual.
//   3. The row itself        — the authority, and the fallback when Redis is
//                              down, which it will be at some point.
//
// A revoked link must die immediately. Checking only the database would be
// correct but slower to reflect; checking only Redis would silently un-revoke
// every link the moment the cache is flushed. Both, in that order, is the only
// version that is right in every state.

import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { keys } from "./cache";

export type LinkRejection = "invalid" | "expired" | "revoked";

export interface VerifiedLink {
  id: string;
  userId: string;
  accountIds: string[];
  sections: string[];
  expiresAt: Date;
}

export type LinkVerification =
  | { ok: true; link: VerifiedLink }
  | { ok: false; reason: LinkRejection };

export async function verifyReportLink(token: string): Promise<LinkVerification> {
  let jti: string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { jti?: string; purpose?: string; accountId?: string };
    if (payload.purpose !== "social-report") return { ok: false, reason: "invalid" };

    // Legacy tokens carried the accountId directly and have no row. They are
    // rejected rather than honoured: they are exactly the unrevocable links
    // this change exists to end, and the longest-lived one expires 7 days after
    // deploy. Regenerating a link is one click.
    if (!payload.jti) return { ok: false, reason: "expired" };
    jti = payload.jti;
  } catch (e) {
    // jsonwebtoken distinguishes these, and so should the page: "expired" has
    // an obvious user action ("ask for a fresh link"), "invalid" does not.
    return { ok: false, reason: e instanceof jwt.TokenExpiredError ? "expired" : "invalid" };
  }

  const denied = await redis.get(keys.revokedJti(jti)).catch(() => null);
  if (denied) return { ok: false, reason: "revoked" };

  const link = await prisma.socialReportLink.findUnique({
    where: { jti },
    select: { id: true, userId: true, accountIds: true, sections: true, expiresAt: true, revokedAt: true },
  });
  if (!link) return { ok: false, reason: "invalid" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    link: {
      id: link.id,
      userId: link.userId,
      accountIds: link.accountIds,
      sections: link.sections,
      expiresAt: link.expiresAt,
    },
  };
}

/**
 * Record a view. Fire-and-forget by design.
 *
 * A failed counter update must never stop the report rendering — the audit
 * trail is useful, the page is the product.
 */
export async function recordLinkView(id: string): Promise<void> {
  await prisma.socialReportLink
    .update({ where: { id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
    .catch(() => undefined);
}
