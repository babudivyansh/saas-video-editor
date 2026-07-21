import { describe, expect, it } from "vitest";
import { generateTotpSecret, generateTotp, verifyTotp, verifyTotpStep, buildOtpauthUri, generateRecoveryCode, hashRecoveryCode } from "./totp";

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

describe("verifyTotpStep", () => {
  const t = 1_700_000_000_000;
  const stepAt = (at: number) => Math.floor(at / 1000 / 30);

  it("returns the time step the code matched, not just a boolean", () => {
    const code = generateTotp(FIXED_SECRET_A, t);
    expect(verifyTotpStep(FIXED_SECRET_A, code, t)).toBe(stepAt(t));
  });

  it("reports the code's OWN step when accepted via drift, not the current one", () => {
    // This is what makes replay protection work: a code from the previous
    // window must not record a step that then rejects the current window's code.
    const previous = generateTotp(FIXED_SECRET_A, t - 30_000);
    expect(verifyTotpStep(FIXED_SECRET_A, previous, t)).toBe(stepAt(t - 30_000));
  });

  it("returns null rather than a falsy number for a bad code", () => {
    expect(verifyTotpStep(FIXED_SECRET_A, "000000", t)).toBeNull();
    expect(verifyTotpStep(FIXED_SECRET_A, "abcdef", t)).toBeNull();
  });

  it("agrees with verifyTotp on every outcome", () => {
    const code = generateTotp(FIXED_SECRET_A, t);
    expect(verifyTotp(FIXED_SECRET_A, code, t)).toBe(verifyTotpStep(FIXED_SECRET_A, code, t) !== null);
    expect(verifyTotp(FIXED_SECRET_B, code, t)).toBe(verifyTotpStep(FIXED_SECRET_B, code, t) !== null);
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
