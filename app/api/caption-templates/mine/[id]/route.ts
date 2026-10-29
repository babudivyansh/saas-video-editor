import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withApi, parseBody } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { checkTemplateChoice } from "@/lib/captions/gate";
import { clearOtherDefaults, savedTemplateUpdateSchema, serializeSavedTemplate } from "@/lib/captions/user-templates";

type Params = { id: string };

// PATCH /api/caption-templates/mine/:id — rename, restyle, rebase or make default.
export const PATCH = withApi<Params>(async (req, { auth, params }) => {
  const body = await parseBody(req, savedTemplateUpdateSchema);
  const existing = await prisma.userCaptionTemplate.findFirst({ where: { id: params.id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Keeping the base it already has is always allowed (a downgrade never
  // breaks a saved look); switching to a higher-plan base is not.
  const locked = await checkTemplateChoice(auth.userId, body.baseTemplateId, existing.baseTemplateId);
  if (locked) return NextResponse.json(locked.body, { status: locked.status });

  const row = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await clearOtherDefaults(tx, auth.userId, existing.id);
    return tx.userCaptionTemplate.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.baseTemplateId !== undefined ? { baseTemplateId: body.baseTemplateId } : {}),
        ...(body.style !== undefined ? { style: body.style as Prisma.InputJsonObject } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      },
    });
  });
  return NextResponse.json({ template: serializeSavedTemplate(row) });
});

// DELETE /api/caption-templates/mine/:id
export const DELETE = withApi<Params>(async (_req, { auth, params }) => {
  const { count } = await prisma.userCaptionTemplate.deleteMany({ where: { id: params.id, userId: auth.userId } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
