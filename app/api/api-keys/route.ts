import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, generateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

const VALID_SCOPES = ["read", "write"] as const;
const MAX_EXPIRY_DAYS = 365;

// GET — list this user's keys. Never returns the plaintext key or hash,
// only the prefix (for the user to tell keys apart) and metadata.
async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: auth.userId },
    select: {
      id: true, name: true, keyPrefix: true, scopes: true, expiresAt: true,
      requestCount: true, lastUsedAt: true, createdAt: true, revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys });
}

// POST — create a new key. Returns the plaintext exactly once; the client
// must show it to the user immediately, since it can never be retrieved again.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: string; scopes?: string[]; expiresInDays?: number };
  const name = (body.name ?? "").trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const requestedScopes = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : ["read", "write"];
  const scopes = requestedScopes.filter((s): s is (typeof VALID_SCOPES)[number] => (VALID_SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) {
    return NextResponse.json({ error: `scopes must be a subset of ${VALID_SCOPES.join(", ")}` }, { status: 400 });
  }

  let expiresAt: Date | undefined;
  if (body.expiresInDays !== undefined) {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
      return NextResponse.json({ error: `expiresInDays must be between 1 and ${MAX_EXPIRY_DAYS}` }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const existingCount = await prisma.apiKey.count({ where: { userId: auth.userId, revokedAt: null } });
  if (existingCount >= 10) {
    return NextResponse.json({ error: "Maximum of 10 active API keys — revoke one before creating another" }, { status: 400 });
  }

  const { plaintext, hash, prefix } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: { userId: auth.userId, name, keyHash: hash, keyPrefix: prefix, scopes, expiresAt },
    select: { id: true, name: true, keyPrefix: true, scopes: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json({ key, plaintext }, { status: 201 });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "api-keys:list" });
export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 3600, keyBy: "user", name: "api-keys:create" });
