import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { redis } from "./redis";

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

export interface TokenPayload {
  userId: string;
  email: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export async function cacheSession(userId: string, token: string): Promise<void> {
  await redis.set(`session:${userId}`, token, "EX", SESSION_TTL);
}

export async function invalidateSession(userId: string): Promise<void> {
  await redis.del(`session:${userId}`);
}

export async function getAuthUser(req: NextRequest): Promise<TokenPayload | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    const cached = await redis.get(`session:${payload.userId}`);
    if (!cached || cached !== token) return null;
    return payload;
  } catch {
    return null;
  }
}
