import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { signToken, cacheSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, otp, type } = await req.json();

    if (!email || !otp || !type || !["login", "register"].includes(type)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const storedOtp = await redis.get(`otp:${type}:${email}`);
    if (!storedOtp || storedOtp !== otp.toString()) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    await redis.del(`otp:${type}:${email}`);

    if (type === "register") {
      const user = await prisma.user.create({
        data: { email, passwordHash: "" },
        select: { id: true, email: true, credits: true },
      });

      const token = signToken({ userId: user.id, email: user.email });
      await cacheSession(user.id, token);

      return NextResponse.json({ token, user }, { status: 201 });
    } else {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const token = signToken({ userId: user.id, email: user.email });
      await cacheSession(user.id, token);

      return NextResponse.json({
        token,
        user: { id: user.id, email: user.email, credits: user.credits },
      });
    }
  } catch (err) {
    console.error("[verify-otp]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
