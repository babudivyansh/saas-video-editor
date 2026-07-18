import { describe, expect, it } from "vitest";
import { generateTotpSecret, generateTotp, verifyTotp, buildOtpauthUri, generateRecoveryCode, hashRecoveryCode } from "./totp";

const FIXED_SECRET_A = "JBSWY3DPEHPK3PXP"; // arbitrary valid base32, used for deterministic tests
const FIXED_SECRET_B = "GEZDGNBVGY3TQOJQ";

describe("generateTotpSecret", () => {
  it("returns a base32 string (no padding, alphabet A-Z2-7 only)", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(0);
  });

  it("returns a different secret on every call", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe("generateTotp / verifyTotp", () => {
  it("produces a 6-digit numeric code", () => {
    const code = generateTotp(FIXED_SECRET_A, 1_700_000_000_000);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("a code verifies against the secret it was generated from, at the same instant", () => {
    const t = 1_700_000_000_000;
    const code = generateTotp(FIXED_SECRET_A, t);
    expect(verifyTotp(FIXED_SECRET_A, code, t)).toBe(true);
  });

  it("the same secret+time always produces the same code (deterministic, not random)", () => {
    const t = 1_700_000_000_000;
    expect(generateTotp(FIXED_SECRET_A, t)).toBe(generateTotp(FIXED_SECRET_A, t));
  });

  it("different secrets produce different codes at the same instant", () => {
    const t = 1_700_000_000_000;
    expect(generateTotp(FIXED_SECRET_A, t)).not.toBe(generateTotp(FIXED_SECRET_B, t));
  });

  it("a code does NOT verify against a different secret", () => {
    const t = 1_700_000_000_000;
    const code = generateTotp(FIXED_SECRET_A, t);
    expect(verifyTotp(FIXED_SECRET_B, code, t)).toBe(false);
  });

  it("tolerates one 30s step of clock drift either direction", () => {
    const t = 1_700_000_000_000;
    const code = generateTotp(FIXED_SECRET_A, t);
    expect(verifyTotp(FIXED_SECRET_A, code, t + 30_000)).toBe(true);
    expect(verifyTotp(FIXED_SECRET_A, code, t - 30_000)).toBe(true);
  });

  it("rejects a code 3 steps (90s) outside the current window", () => {
    const t = 1_700_000_000_000;
    const code = generateTotp(FIXED_SECRET_A, t);
    expect(verifyTotp(FIXED_SECRET_A, code, t + 90_000)).toBe(false);
  });

  it("rejects malformed input (wrong length, non-digits) without throwing", () => {
    expect(verifyTotp(FIXED_SECRET_A, "12345")).toBe(false);
    expect(verifyTotp(FIXED_SECRET_A, "abcdef")).toBe(false);
    expect(verifyTotp(FIXED_SECRET_A, "")).toBe(false);
  });
});

describe("buildOtpauthUri", () => {
  it("embeds the secret, issuer, and account email in a standard otpauth:// URI", () => {
    const uri = buildOtpauthUri(FIXED_SECRET_A, "user@example.com", "Clipiro");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${FIXED_SECRET_A}`);
    expect(uri).toContain("issuer=Clipiro");
    expect(decodeURIComponent(uri)).toContain("Clipiro:user@example.com");
  });
});

describe("recovery codes", () => {
  it("generateRecoveryCode produces a grouped, readable code", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  });

  it("hashRecoveryCode is deterministic", () => {
    const code = generateRecoveryCode();
    expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(code));
  });

  it("hashRecoveryCode normalizes formatting (dash/case-insensitive) so user-entry quirks don't break matching", () => {
    const base = "ABCDE-12345";
    expect(hashRecoveryCode(base)).toBe(hashRecoveryCode("abcde12345"));
    expect(hashRecoveryCode(base)).toBe(hashRecoveryCode("ABCDE12345"));
  });

  it("different codes hash differently", () => {
    expect(hashRecoveryCode(generateRecoveryCode())).not.toBe(hashRecoveryCode(generateRecoveryCode()));
  });
});
