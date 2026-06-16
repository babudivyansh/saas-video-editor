import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { slug, name, priceInPaise, credits } = body;
  if (!slug || !name || priceInPaise == null || credits == null) {
    return NextResponse.json({ error: "slug, name, priceInPaise, credits are required" }, { status: 400 });
  }

  const exists = await prisma.plan.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: "A plan with that slug already exists" }, { status: 409 });

  const plan = await prisma.plan.create({
    data: {
      slug: String(slug).trim(),
      name: String(name).trim(),
      priceInPaise: Number(priceInPaise),
      credits: Number(credits),
      currency: body.currency ?? "INR",
      features: Array.isArray(body.features) ? body.features : [],
      active: body.active ?? true,
      sortOrder: Number(body.sortOrder ?? 0),
    },
  });
  return NextResponse.json({ plan }, { status: 201 });
}
