import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PHONE_RE = /^\+?[0-9]{7,15}$/;

// Update the caller's editable profile fields (display name, phone, avatar URL).
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: { name?: string | null; phone?: string | null; avatarUrl?: string | null } = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : null;
    if (name && name.length > 60) {
      return NextResponse.json({ error: "Name must be 60 characters or fewer" }, { status: 400 });
    }
    data.name = name || null;
  }
  if ("phone" in body) {
    const raw = typeof body.phone === "string" ? body.phone.trim() : "";
    const phone = raw.replace(/[\s-]/g, "");
    if (phone) {
      if (!PHONE_RE.test(phone)) {
        return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
      }
      const taken = await prisma.user.findUnique({ where: { phone } });
      if (taken && taken.id !== auth.userId) {
        return NextResponse.json({ error: "Phone number already in use" }, { status: 409 });
      }
    }
    data.phone = phone || null;
  }
  if ("avatarUrl" in body) {
    data.avatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl ? body.avatarUrl : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { id: true, email: true, phone: true, name: true, avatarUrl: true },
  });
  return NextResponse.json({ user });
}
