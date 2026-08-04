import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { NotFoundError, ok, withSocial } from "@/lib/social/api";
import { keys } from "@/lib/social/cache";

// DELETE /api/social/report-link/[id] → revoke immediately
//
// Two writes, deliberately. The row is the durable record; the Redis denylist
// is what makes revocation INSTANT — the public page checks it before it
// touches the database, so a link dies the moment the button is pressed rather
// than whenever a cache happens to expire.
//
// The denylist entry is given the token's REMAINING lifetime as its TTL. Longer
// would be waste (the JWT stops verifying anyway); shorter would open a window
// where a revoked token works again, which is the exact failure this fixes.
//
// Not subscriber-gated: a lapsed user must still be able to shut off a link
// they published. Locking someone out of revoking their own share link because
// their card expired would be indefensible.
type Params = { id: string };

export const DELETE = withSocial<Params>(async (_req, { auth, params }) => {
  const link = await prisma.socialReportLink.findFirst({
    where: { id: params.id, userId: auth.userId },
    select: { id: true, jti: true, expiresAt: true, revokedAt: true },
  });
  if (!link) throw new NotFoundError("Link not found");

  // Already revoked is a success, not an error: the caller wanted it off, and
  // it is off. Reporting a failure would invite a panicked second attempt.
  if (link.revokedAt) return ok({ revoked: true, alreadyRevoked: true });

  const now = new Date();
  await prisma.socialReportLink.update({ where: { id: link.id }, data: { revokedAt: now } });

  const remainingMs = link.expiresAt.getTime() - now.getTime();
  if (remainingMs > 0) {
    await redis
      .set(keys.revokedJti(link.jti), "1", "EX", Math.ceil(remainingMs / 1000))
      // A Redis failure must not make revocation look like it failed — the row
      // is already written, and the public page falls back to reading it.
      .catch(() => undefined);
  }

  return ok({ revoked: true, revokedAt: now });
}, { subscriber: false });
