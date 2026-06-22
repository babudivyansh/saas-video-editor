import { prisma } from "@/lib/prisma";

export function generateAffiliateCode(name: string): string {
  const prefix = (name ?? "USR").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function createUniqueCode(name: string): Promise<string> {
  let code = generateAffiliateCode(name);
  let attempts = 0;
  while (attempts < 10) {
    const existing = await prisma.affiliate.findUnique({ where: { code } });
    if (!existing) return code;
    code = generateAffiliateCode(name);
    attempts++;
  }
  // Fallback: pure random
  return "REF-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
