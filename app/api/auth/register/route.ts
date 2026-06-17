import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, cacheSession } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = (body.firstName ?? "").trim();
    const lastName = (body.lastName ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const phoneRaw = (body.phone ?? "").trim();
    const phone = phoneRaw.replace(/[\s-]/g, "");
    const { password, confirmPassword } = body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (!PHONE_RE.test(phone)) {
      return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
    }

    const [emailTaken, phoneTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { phone } }),
    ]);
    if (emailTaken) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    if (phoneTaken) {
      return NextResponse.json({ error: "Phone number already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        phone,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        passwordHash,
      },
      select: { id: true, email: true, credits: true },
    });

    const token = signToken({ userId: user.id, email: user.email });
    await cacheSession(user.id, token);

    return NextResponse.json({ token, user }, { status: 201 });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
