// Caption looks a user saved to reuse ("My templates" in Caption Studio): a
// library template plus a CaptionStyleOverride. Routes:
// app/api/caption-templates/mine (list, create) and .../mine/[id] (edit, delete).

import { z } from "zod";
import type { Prisma, UserCaptionTemplate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TierId } from "@/lib/plans/tiers";
import { isKnownTemplateId, resolveTemplateId } from "@clipiro/shared/caption-templates";
import { validateCaptionStyle, type CaptionStyleOverride } from "@clipiro/shared/caption-style";

/** How many saved looks each plan keeps. */
export const SAVED_CAPTION_TEMPLATE_LIMIT: Record<TierId, number> = { free: 1, creator: 3, pro: 5, studio: 10 };

const styleSchema = z.custom<CaptionStyleOverride>((v) => validateCaptionStyle(v) === null, {
  message: "That caption style isn't valid.",
});

export const savedTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseTemplateId: z.string().refine(isKnownTemplateId, "Unknown caption template"),
  style: styleSchema.default({}),
  isDefault: z.boolean().default(false),
});

export const savedTemplateUpdateSchema = savedTemplateCreateSchema.partial();

export interface SavedCaptionTemplate {
  id: string;
  name: string;
  baseTemplateId: string;
  style: CaptionStyleOverride;
  isDefault: boolean;
  updatedAt: string;
}

export function serializeSavedTemplate(row: UserCaptionTemplate): SavedCaptionTemplate {
  return {
    id: row.id,
    name: row.name,
    // Retired ids resolve to their replacement, like everywhere else a template id is read.
    baseTemplateId: resolveTemplateId(row.baseTemplateId),
    style: (row.style ?? {}) as CaptionStyleOverride,
    isDefault: row.isDefault,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Within a transaction: clears the user's other default before one is set. */
export async function clearOtherDefaults(tx: Prisma.TransactionClient, userId: string, keepId?: string) {
  await tx.userCaptionTemplate.updateMany({
    where: { userId, isDefault: true, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { isDefault: false },
  });
}

export function listSavedTemplates(userId: string) {
  return prisma.userCaptionTemplate.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
}
