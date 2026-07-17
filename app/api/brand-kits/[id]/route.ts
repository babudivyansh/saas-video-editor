import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FIELD_KEYS = [
  "fontName", "fontSize", "baseColor", "highlightColor", "outlineColor", "shadowColor",
  "outlineWidth", "shadowDepth", "borderStyle", "alignment", "animated", "logoUrl",
] as const;

// PATCH — rename and/or update a brand kit's style fields.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.brandKit.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 100);
  for (const key of FIELD_KEYS) {
    if (key in body) data[key] = body[key];
  }

  const kit = await prisma.brandKit.update({ where: { id }, data });
  return NextResponse.json({ kit });
}

// DELETE — remove a brand kit. Clips that already applied it keep their own
// copy of the style (Clip.subtitleStyleOverride) — deleting the kit only
// removes the reusable template, not anything already rendered.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await prisma.brandKit.deleteMany({ where: { id, userId: auth.userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ status: "deleted" });
}
