import { prisma } from "./prisma";
import { normalizeEmail } from "./auth-validation";

/**
 * The email a sign-in request names. Accepts the historical `identifier`
 * field as well as `email` so an older client build keeps working; phone
 * numbers are no longer an identifier (removed 2026-09-28).
 */
export function emailFromBody(body: { identifier?: unknown; email?: unknown }): string {
  return normalizeEmail(body.email ?? body.identifier);
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
