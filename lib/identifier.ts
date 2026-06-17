import { prisma } from "./prisma";

export type AuthMethod = "email" | "phone";

/** Normalizes an email (lowercase) or phone (strip spaces/dashes) identifier. */
export function normalizeIdentifier(method: AuthMethod, raw: string): string {
  const value = (raw ?? "").trim();
  return method === "email" ? value.toLowerCase() : value.replace(/[\s-]/g, "");
}

/** Looks up a user by the given login method + normalized identifier. */
export async function findUserByMethod(method: AuthMethod, identifier: string) {
  return prisma.user.findUnique({
    where: method === "email" ? { email: identifier } : { phone: identifier },
  });
}
