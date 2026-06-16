import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Adjust a user's credits, role, or current plan tier.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const data: { credits?: number; role?: "USER" | "ADMIN"; planId?: string | null } = {};

  if ("credits" in body) {
    const credits = Number(body.credits);
    if (!Number.isInteger(credits) || credits < 0) {
      return NextResponse.json({ error: "credits must be a non-negative integer" }, { status: 400 });
    }
    data.credits = credits;
  }
  if ("role" in body) {
    if (body.role !== "USER" && body.role !== "ADMIN") {
      return NextResponse.json({ error: "role must be USER or ADMIN" }, { status: 400 });
    }
    data.role = body.role;
  }
  if ("planId" in body) {
    data.planId = body.planId || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, credits: true, role: true,
      plan: { select: { id: true, name: true, slug: true } },
    },
  });

  // Keep the Redis credit fast-path in sync when an admin sets credits.
  if (data.credits !== undefined) {
    await redis.set(`credits:${id}`, String(data.credits), "EX", 3600);
  }

  return NextResponse.json({ user });
}
