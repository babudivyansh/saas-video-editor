import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApi, parseBody } from "@/lib/api-handler";

// Same field shape as Clip.subtitleStyleOverride (app/dashboard/create/auto-clip/page.tsx's
// ClipEditorDrawer Style tab) — a brand kit is that same object, saved once
// at the account level instead of only per-clip.
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    fontName: z.string().max(100).nullable().optional(),
    fontSize: z.number().int().nullable().optional(),
    baseColor: z.string().max(32).nullable().optional(),
    highlightColor: z.string().max(32).nullable().optional(),
    outlineColor: z.string().max(32).nullable().optional(),
    shadowColor: z.string().max(32).nullable().optional(),
    outlineWidth: z.number().int().nullable().optional(),
    shadowDepth: z.number().int().nullable().optional(),
    borderStyle: z.number().int().nullable().optional(),
    alignment: z.number().int().nullable().optional(),
    animated: z.boolean().nullable().optional(),
    logoUrl: z.string().max(2048).nullable().optional(),
  })
  .strict();

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
  const { name, ...fields } = await parseBody(req, bodySchema);
  const kit = await prisma.brandKit.create({
    data: { userId: auth.userId, name, ...fields },
  });
  return NextResponse.json({ kit }, { status: 201 });
}

export const GET = withApi(handleGET);
export const POST = withApi(handlePOST);
