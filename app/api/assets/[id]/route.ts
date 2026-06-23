import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteS3Object } from "@/utils/s3-upload";

async function getOwnedAsset(id: string, userId: string) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset || asset.userId !== userId) return null;
  return asset;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await getOwnedAsset(id, auth.userId);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const updated = await prisma.asset.update({
    where: { id },
    data: { name: name.trim() },
  });

  return NextResponse.json({ asset: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await getOwnedAsset(id, auth.userId);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteS3Object(asset.s3Key);
  await prisma.asset.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
