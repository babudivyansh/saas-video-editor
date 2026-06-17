import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, cacheSession } from "@/lib/auth";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const method: AuthMethod = body.method === "phone" ? "phone" : "email";
    const identifier = normalizeIdentifier(method, body.identifier ?? body.email ?? body.phone ?? "");
    const { password } = body;

    if (!identifier || !password) {
      return NextResponse.json({ error: "Credentials are required" }, { status: 400 });
    }

    const user = await findUserByMethod(method, identifier);
    // Always run a compare to avoid leaking which identifiers exist via timing.
    const valid = user
      ? await bcrypt.compare(password, user.passwordHash || "")
      : false;
    if (!user || !valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signToken({ userId: user.id, email: user.email });
    await cacheSession(user.id, token);

    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
