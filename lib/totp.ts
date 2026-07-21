// RFC 4226 (HOTP) / RFC 6238 (TOTP) implemented directly on Node's native
// crypto.createHmac — no dependency needed for the algorithm itself (only
// rendering the setup QR image needs one, see the `qrcode` package used in
// the 2FA setup route). 30-second step, 6 digits, SHA-1 — the universal
// default every authenticator app (Google/Microsoft/Authy/1Password
// Authenticator, etc.) assumes unless told otherwise.

import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const CLOCK_DRIFT_STEPS = 1; // accept the adjacent 30s step either side

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20)); // 160 bits — RFC 4226's recommended HMAC-SHA-1 key length
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function generateTotp(secretBase32: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Constant-time verification, tolerant of ±1 clock step of drift. Returns the
 * time step the code actually matched, or null if it matched none.
 *
 * Callers that enforce single-use (replay protection) need the step, not just
 * a yes/no — see User.twoFactorLastUsedStep and app/api/auth/2fa/verify-login.
 */
export function verifyTotpStep(secretBase32: string, code: string, at: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  const codeBuf = Buffer.from(code);
  for (let drift = -CLOCK_DRIFT_STEPS; drift <= CLOCK_DRIFT_STEPS; drift++) {
    const expected = Buffer.from(hotp(secret, counter + drift));
    if (crypto.timingSafeEqual(expected, codeBuf)) return counter + drift;
  }
  return null;
}

/**
 * Boolean form, for callers with no replay concern (enrollment confirmation).
 * Deliberately not `verifyTotpStep(...) as unknown as boolean` — step 0 is
 * falsy, and that footgun is the whole reason the two are separate functions.
 */
export function verifyTotp(secretBase32: string, code: string, at: number = Date.now()): boolean {
  return verifyTotpStep(secretBase32, code, at) !== null;
}

export function buildOtpauthUri(secretBase32: string, accountEmail: string, issuer = "Clipiro"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Recovery codes ─────────────────────────────────────────────────────────
// High-entropy, machine-generated (unlike user passwords) — a fast SHA-256
// hash is sufficient and matches how API keys are already hashed in this
// codebase (lib/auth.ts's hashApiKey), rather than a slow bcrypt hash whose
// purpose is defending against low-entropy user-chosen secrets.

export function generateRecoveryCode(): string {
  // 10 random hex chars (~40 bits), grouped for readability: XXXXX-XXXXX
  const raw = crypto.randomBytes(8).toString("hex").slice(0, 10).toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
}
