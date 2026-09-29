import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Does this request carry the cron shared secret (`Authorization: Bearer …`)?
 *
 * Header only: a `?secret=` query parameter ends up in access logs, proxy
 * logs and shell history, and every entry in ops/crontab already sends the
 * header. Compared in constant time — both sides are hashed first so their
 * lengths match and nothing about the secret leaks through timing.
 *
 * Callers still check `!secret` themselves (see cron-auth.test.ts): an unset
 * secret must reject, never skip the check.
 */
export function cronSecretMatches(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (!provided || provided === header) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
