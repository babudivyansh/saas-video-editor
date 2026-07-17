import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, generateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET — list this user's keys. Never returns the plaintext key or hash,
// only the prefix (for the user to tell keys apart) and metadata.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: auth.userId },
    select: { id: true, name: true, keyPrefix: true, scopes: true, lastUsedAt: true, createdAt: true, revokedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys });
}

// POST — create a new key. Returns the plaintext exactly once; the client
// must show it to the user immediately, since it can never be retrieved again.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: string };
  const name = (body.name ?? "").trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const existingCount = await prisma.apiKey.count({ where: { userId: auth.userId, revokedAt: null } });
  if (existingCount >= 10) {
    return NextResponse.json({ error: "Maximum of 10 active API keys — revoke one before creating another" }, { status: 400 });
  }

  const { plaintext, hash, prefix } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: { userId: auth.userId, name, keyHash: hash, keyPrefix: prefix, scopes: ["read", "write"] },
    select: { id: true, name: true, keyPrefix: true, scopes: true, createdAt: true },
  });

  return NextResponse.json({ key, plaintext }, { status: 201 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 3600, keyBy: "user", name: "api-keys:create" });
