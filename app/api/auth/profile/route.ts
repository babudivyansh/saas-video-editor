import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hardDeleteUserAccount } from "@/lib/account-deletion";
import { LOCALE_COOKIE, isSupportedLocale } from "@/lib/i18n-locales";
import { markQuestComplete } from "@/lib/quests";
import { s3KeyToPublicUrl } from "@/utils/s3-upload";
import { withRateLimit } from "@/lib/with-rate-limit";

const PHONE_RE = /^\+?[0-9]{7,15}$/;
const GENDERS = ["male", "female", "unspecified"] as const;
const INTENDED_USES = ["content_creator", "business_marketing", "personal", "other"] as const;

// Update the caller's editable profile fields (display name, phone, avatar URL,
// gender, intended use, preferred language).
async function handlePATCH(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: {
    name?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    gender?: string | null;
    intendedUse?: string | null;
    preferredLanguage?: string;
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
  if (typeof body.avatarAssetId === "string" && body.avatarAssetId) {
    // Choosing an existing library asset as the avatar — resolve to the
    // asset's PERMANENT public URL server-side (never the picker's
    // short-lived signed read URL, which would leave the avatar broken a few
    // hours later) and verify the asset actually belongs to this user.
    const asset = await prisma.asset.findFirst({
      where: { id: body.avatarAssetId, userId: auth.userId, kind: "image" },
      select: { s3Key: true },
    });
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    data.avatarUrl = s3KeyToPublicUrl(asset.s3Key);
  } else if ("avatarUrl" in body) {
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
  if ("preferredLanguage" in body) {
    const preferredLanguage = typeof body.preferredLanguage === "string" ? body.preferredLanguage : "";
    if (!isSupportedLocale(preferredLanguage)) {
      return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
    }
    data.preferredLanguage = preferredLanguage;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { id: true, email: true, phone: true, name: true, avatarUrl: true, gender: true, intendedUse: true, preferredLanguage: true },
  });

  // A profile counts as "complete" once the user has a display name, an avatar,
  // and their intended use (niche) set — the fields that personalize the app.
  if (user.name && user.avatarUrl && user.intendedUse) {
    void markQuestComplete(auth.userId, "complete-profile");
  }

  const res = NextResponse.json({ user });
  // Mirrors the DB value into the cookie i18n/request.ts reads, so the new
  // language takes effect on the very next server render without a DB hit.
  if (data.preferredLanguage) {
    res.cookies.set(LOCALE_COOKIE, data.preferredLanguage, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}

// Permanently delete the caller's own account. Requires the current password as
// confirmation. Affiliate/Referral/Commission rows have no onDelete: Cascade in
// the schema, so they must be cleared before the User row can be deleted, or
// Postgres throws a foreign-key violation. Purchase is onDelete: Restrict (it's
// a financial record, never silently destroyed) — handled by the purchase-count
// check below. Everything else (Project + Clip, Asset, UserQuest, SocialAccount
// + its children) cascades automatically.
async function handleDELETE(req: NextRequest) {
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

  const result = await hardDeleteUserAccount(auth.userId);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });

  return NextResponse.json({ success: true });
}

export const PATCH = withRateLimit(handlePATCH, { limit: 20, windowSec: 900, keyBy: "user", name: "auth:profile:patch" });
export const DELETE = withRateLimit(handleDELETE, { limit: 5, windowSec: 900, keyBy: "user", name: "auth:profile:delete" });
