import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApi, parseBody } from "@/lib/api-handler";
import { brandKitCreateSchema } from "@/lib/brand-kit-schema";
import { checkTemplateChoice } from "@/lib/captions/gate";

// GET — list this user's brand kits.
async function handleGET(req: NextRequest, { auth }: { auth: { userId: string } }) {
  const kits = await prisma.brandKit.findMany({
    where: { userId: auth.userId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ kits });
}

// POST — save the current style as a new named brand kit.
async function handlePOST(req: NextRequest, { auth }: { auth: { userId: string } }) {
  const { name, ...fields } = await parseBody(req, brandKitCreateSchema);
  const locked = await checkTemplateChoice(auth.userId, fields.captionTemplateId);
  if (locked) return NextResponse.json(locked.body, { status: locked.status });
  const kit = await prisma.brandKit.create({
    data: { userId: auth.userId, name, ...fields },
  });
  return NextResponse.json({ kit }, { status: 201 });
}

export const GET = withApi(handleGET);
export const POST = withApi(handlePOST);
