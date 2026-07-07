import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, cacheSession } from "@/lib/auth";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";
import { sendNewLoginAlertEmail } from "@/lib/email";

// Fixed-cost bcrypt hash with no matching password, compared against when the
// account doesn't exist so the response takes the same time either way and
// can't be used to enumerate valid identifiers.
const DUMMY_HASH = "$2b$12$ipMR8KgUrP3uE9KmGnmsnu9652Wk4V/4DG8PcTNPmZashszFKZSHC";

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
    // Always run a compare — against the dummy hash when the user doesn't
    // exist — so both branches take the same time and timing can't be used
    // to enumerate valid identifiers.
    const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signToken({ userId: user.id, email: user.email });
    await cacheSession(user.id, token);

    // ── Update lastLoginAt + send security alert (non-fatal) ──────────
    const now = new Date();
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    }).catch(() => { /* non-fatal */ });

    // Parse device from User-Agent
    const ua = req.headers.get("user-agent") ?? "";
    const device = ua.includes("Mobile") ? "Mobile Browser"
      : ua.includes("Chrome") ? "Chrome on Desktop"
      : ua.includes("Firefox") ? "Firefox on Desktop"
      : ua.includes("Safari") ? "Safari on Desktop"
      : "Unknown device";

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const timeStr = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

    // Fire & forget — fetch location from free ip-api, then send alert
    ;(async () => {
      try {
        let location = "Unknown location";
        if (ip && ip !== "::1" && !ip.startsWith("127.")) {
          const geo = await fetch(`http://ip-api.com/json/${ip}?fields=city,country`, { signal: AbortSignal.timeout(2000) })
            .then((r) => r.json()).catch(() => null);
          if (geo?.city) location = `${geo.city}, ${geo.country}`;
        }
        const displayName = user.firstName ?? user.name ?? "";
        await sendNewLoginAlertEmail(user.email, displayName, timeStr, location, device);
      } catch (e) {
        console.error("[login] alert email error", e);
      }
    })();

    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
