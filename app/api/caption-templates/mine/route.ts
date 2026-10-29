import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withApi, parseBody } from "@/lib/api-handler";
import { getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkTemplateChoice } from "@/lib/captions/gate";
import {
  SAVED_CAPTION_TEMPLATE_LIMIT,
  clearOtherDefaults,
  listSavedTemplates,
  savedTemplateCreateSchema,
  serializeSavedTemplate,
} from "@/lib/captions/user-templates";

// GET /api/caption-templates/mine — the caller's saved caption looks and how
// many their plan keeps.
export const GET = withApi(async (_req, { auth }) => {
  const [rows, tier] = await Promise.all([listSavedTemplates(auth.userId), getUserTier(auth.userId)]);
  return NextResponse.json({ templates: rows.map(serializeSavedTemplate), limit: SAVED_CAPTION_TEMPLATE_LIMIT[tier] });
});

// POST /api/caption-templates/mine { name, baseTemplateId, style, isDefault }
export const POST = withApi(async (req, { auth }) => {
  const body = await parseBody(req, savedTemplateCreateSchema);

  // A look built on a Creator/Pro template is still that template.
  const locked = await checkTemplateChoice(auth.userId, body.baseTemplateId);
  if (locked) return NextResponse.json(locked.body, { status: locked.status });

  const limit = SAVED_CAPTION_TEMPLATE_LIMIT[await getUserTier(auth.userId)];
  const row = await prisma.$transaction(async (tx) => {
    // Counted with the user's row locked, so two saves at once can't both
    // slip under the limit.
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${auth.userId} FOR UPDATE`;
    const count = await tx.userCaptionTemplate.count({ where: { userId: auth.userId } });
    if (count >= limit) return null;
    if (body.isDefault) await clearOtherDefaults(tx, auth.userId);
    return tx.userCaptionTemplate.create({
      data: { userId: auth.userId, name: body.name, baseTemplateId: body.baseTemplateId, style: body.style as Prisma.InputJsonObject, isDefault: body.isDefault },
    });
  });
  if (!row) {
    return NextResponse.json(
      { error: "template_limit", message: `Your plan keeps ${limit} saved caption ${limit === 1 ? "look" : "looks"}. Delete one or upgrade to save more.`, limit },
      { status: 403 },
    );
  }
  return NextResponse.json({ template: serializeSavedTemplate(row) }, { status: 201 });
});
