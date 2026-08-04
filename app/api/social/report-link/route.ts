import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { HttpError, assertOwnedAccounts, ok, parseBody, withSocial } from "@/lib/social/api";
import { accountIdSchema, reportSectionSchema } from "@/lib/social/schemas";

// GET  /api/social/report-link → this user's links, with view counts
// POST /api/social/report-link → mint one
//
// WHAT CHANGED AND WHY. The old link was a bare 7-day JWT carrying the
// accountId, with no server-side record. It could not be revoked: a link pasted
// into the wrong channel stayed live for a week, and the only kill switch was
// rotating JWT_SECRET — which signs out every user in the product.
//
// Now the token carries only a `jti` and the scope lives in a row we own. That
// makes the link revocable, re-scopeable and auditable, and the token smaller.
const MAX_ACTIVE_LINKS = 20;
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 90;

const bodySchema = z.object({
  accountIds: z.array(accountIdSchema).min(1).max(10),
  sections: z.array(reportSectionSchema).default(["kpis", "trends", "content"]),
  expiresInDays: z.coerce.number().int().min(1).max(MAX_TTL_DAYS).default(DEFAULT_TTL_DAYS),
});

export const GET = withSocial(async (_req, { auth }) => {
  const links = await prisma.socialReportLink.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    // jti is deliberately not selected: it is the bearer secret inside the
    // token, and a listing endpoint has no reason to hand it back.
    select: {
      id: true, accountIds: true, sections: true, expiresAt: true, revokedAt: true,
      viewCount: true, lastViewedAt: true, createdAt: true,
    },
  });
  return ok({ links });
}, {
  rateLimit: { key: (auth) => `social:report-link:${auth.userId}`, max: 60, windowSec: 60 },
});

export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, bodySchema);
  await assertOwnedAccounts(auth.userId, body.accountIds);

  const active = await prisma.socialReportLink.count({
    where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (active >= MAX_ACTIVE_LINKS) {
    throw new HttpError(409, `You can have up to ${MAX_ACTIVE_LINKS} active links. Revoke one first.`, "limit_reached");
  }

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + body.expiresInDays * 86_400_000);

  const link = await prisma.socialReportLink.create({
    data: { userId: auth.userId, jti, accountIds: body.accountIds, sections: body.sections, expiresAt },
  });

  // The JWT expiry mirrors the row's, so an expired token fails signature
  // verification before any query runs. The row stays the authority, because
  // revocation has to work on a token that is still cryptographically valid —
  // that is the entire point of the change.
  const token = jwt.sign({ jti, purpose: "social-report" }, env.JWT_SECRET, {
    expiresIn: `${body.expiresInDays}d`,
  });

  return ok(
    {
      url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/report/social/${token}`,
      link: {
        id: link.id,
        accountIds: link.accountIds,
        sections: link.sections,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
      },
    },
    { status: 201 },
  );
}, {
  rateLimit: { key: (auth) => `social:report-link:create:${auth.userId}`, max: 20, windowSec: 3600 },
});
