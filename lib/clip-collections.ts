import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Clip collections: named, hand-made sets of clips across projects. The
// built-in "favorites" id is every hearted clip and has no row of its own.

export const FAVORITES_ID = "favorites";
export const MAX_COLLECTIONS_PER_USER = 100;
export const MAX_CLIPS_PER_REQUEST = 100;

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, "Give the collection a name")
  .max(80, "Keep the name under 80 characters");

export const clipIdsSchema = z
  .object({ clipIds: z.array(z.string().min(1).max(100)).min(1).max(MAX_CLIPS_PER_REQUEST) })
  .strict();

/** The caller's collection, or null — never someone else's. */
export function getOwnedCollection(id: string, userId: string) {
  return prisma.clipCollection.findFirst({ where: { id, userId }, select: { id: true, name: true } });
}

/** Of these clip ids, the ones in the caller's own projects. */
export async function ownedClipIds(clipIds: string[], userId: string): Promise<string[]> {
  const rows = await prisma.clip.findMany({
    where: { id: { in: [...new Set(clipIds)] }, project: { userId } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
