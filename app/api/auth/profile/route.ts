import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const PHONE_RE = /^\+?[0-9]{7,15}$/;
const GENDERS = ["male", "female", "unspecified"] as const;
const INTENDED_USES = ["content_creator", "business_marketing", "personal", "other"] as const;

// Update the caller's editable profile fields (display name, phone, avatar URL,
// gender, intended use).
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: {
    name?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    gender?: string | null;
    intendedUse?: string | null;
  } = {};

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
  if ("gender" in body) {
    const gender = typeof body.gender === "string" ? body.gender : null;
    if (gender && !GENDERS.includes(gender as (typeof GENDERS)[number])) {
      return NextResponse.json({ error: "Invalid gender value" }, { status: 400 });
    }
    data.gender = gender;
  }
  if ("intendedUse" in body) {
    const intendedUse = typeof body.intendedUse === "string" ? body.intendedUse : null;
    if (intendedUse && !INTENDED_USES.includes(intendedUse as (typeof INTENDED_USES)[number])) {
      return NextResponse.json({ error: "Invalid intended-use value" }, { status: 400 });
    }
    data.intendedUse = intendedUse;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { id: true, email: true, phone: true, name: true, avatarUrl: true, gender: true, intendedUse: true },
  });
  return NextResponse.json({ user });
}

// Permanently delete the caller's own account. Requires the current password as
// confirmation. Affiliate/Referral/Commission rows have no onDelete: Cascade in
// the schema, so they must be cleared before the User row can be deleted, or
// Postgres throws a foreign-key violation. Everything else (Purchase, Project +
// Clip, Asset, UserQuest, SocialAccount + its children) cascades automatically.
export async function DELETE(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "Password is required to delete your account" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  await prisma.$transaction([
    prisma.commission.deleteMany({ where: { referral: { referredUserId: auth.userId } } }),
    prisma.referral.deleteMany({ where: { referredUserId: auth.userId } }),
    prisma.commission.deleteMany({ where: { affiliate: { userId: auth.userId } } }),
    prisma.referral.deleteMany({ where: { affiliate: { userId: auth.userId } } }),
    prisma.affiliate.deleteMany({ where: { userId: auth.userId } }),
    prisma.user.delete({ where: { id: auth.userId } }),
  ]);

  await Promise.allSettled([
    redis.del(`session:${auth.userId}`),
    redis.del(`credits:${auth.userId}`),
  ]);

  return NextResponse.json({ success: true });
}
