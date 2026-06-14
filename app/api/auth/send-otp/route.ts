import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendOtpEmail } from "@/lib/email";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { email, type } = await req.json();

    if (!email || !type || !["login", "register"].includes(type)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (type === "register") {
      if (existing) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
    } else {
      if (!existing) {
        return NextResponse.json({ error: "No account found with this email" }, { status: 404 });
      }
    }

    const otp = generateOtp();
    await redis.set(`otp:${type}:${email}`, otp, "EX", 600);

    await sendOtpEmail(email, otp);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-otp]", err);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
