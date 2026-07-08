import crypto from "crypto";
import { env } from "@/lib/env";

// Authenticated symmetric encryption for secrets we must store but never expose
// (OAuth access/refresh tokens for linked social accounts). AES-256-GCM gives
// confidentiality + integrity (the auth tag detects tampering). Each value gets
// a fresh random 96-bit IV, and the ciphertext is self-describing so the key can
// be rotated later without guessing the format.
//
// Stored format (string):  v1:<iv b64>:<tag b64>:<ciphertext b64>

const ALGO = "aes-256-gcm";

// Resolve the 32-byte key. In production a dedicated `SOCIAL_TOKEN_KEY` (base64
// of 32 random bytes) is REQUIRED and kept separate from the database. In dev we
// derive a stable key from JWT_SECRET so the feature works locally before a
// dedicated key is provisioned — never allowed in production.
function getKey(): Buffer {
  const b64 = env.SOCIAL_TOKEN_KEY;
  if (b64) {
    const key = Buffer.from(b64, "base64");
    if (key.length === 32) return key;
    throw new Error("SOCIAL_TOKEN_KEY must be a base64-encoded 32-byte key");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SOCIAL_TOKEN_KEY must be set in production");
  }
  const seed = env.JWT_SECRET;
  if (!seed) {
    throw new Error("SOCIAL_TOKEN_KEY (or JWT_SECRET in dev) must be set to encrypt social tokens");
  }
  return crypto.createHash("sha256").update(`social-token-key:${seed}`).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("unsupported ciphertext format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// True when a value looks like our ciphertext (used to avoid leaking plaintext
// if a column is ever read before encryption was applied).
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("v1:") && value.split(":").length === 4;
}
