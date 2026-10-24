import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Does this request carry the cron shared secret?
 *
 * Accepted in either header:
 *   • `X-Cron-Secret: <secret>` — what production sends. Hostinger's web
 *     server in front of the Node app drops `Authorization`, so a Bearer
 *     header never reaches Next there and every scheduled call answered 401
 *     (2026-10-24: the correct secret was refused both through the CDN and
 *     straight to 127.0.0.1).
 *   • `Authorization: Bearer <secret>` — for hosts that pass it through.
 *
 * Header only: a `?secret=` query parameter ends up in access logs, proxy
 * logs and shell history. Compared in constant time — both sides are hashed
 * first so their lengths match and nothing about the secret leaks through
 * timing.
 *
 * Callers still check `!secret` themselves (see cron-auth.test.ts): an unset
 * secret must reject, never skip the check.
 */
export function cronSecretMatches(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  return [req.headers.get("x-cron-secret") ?? "", bearer === header ? "" : bearer].some((provided) => {
    if (!provided) return false;
    const a = createHash("sha256").update(provided).digest();
    const b = createHash("sha256").update(secret).digest();
    return timingSafeEqual(a, b);
  });
}

/** Headers that carry a cron secret, in both forms, so a call is accepted
 * whether or not the host strips `Authorization`. */
export function cronAuthHeaders(secret: string): Record<string, string> {
  return { Authorization: `Bearer ${secret}`, "X-Cron-Secret": secret };
}
