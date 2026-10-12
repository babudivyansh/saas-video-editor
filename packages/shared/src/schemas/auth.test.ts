import { describe, expect, it } from "vitest";
import {
  emailSchema,
  fieldErrors,
  loginRequest,
  nameSchema,
  otpSchema,
  passwordSchema,
  signupRequest,
} from "./auth";

describe("auth schemas", () => {
  it("normalises and validates email", () => {
    expect(emailSchema.parse("  Maya@CreatorLab.co ")).toBe("maya@creatorlab.co");
    expect(emailSchema.safeParse("maya@creatorlab").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });

  it("enforces the server's password rule: 8+ characters, at most 72 bytes", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(true); // no digit needed, same as the API
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
    // 24 × "€" = 72 bytes but 24 characters; 25 is over.
    expect(passwordSchema.safeParse("€".repeat(24)).success).toBe(true);
    expect(passwordSchema.safeParse("€".repeat(25)).success).toBe(false);
  });

  it("cleans names like the web does", () => {
    expect(nameSchema.parse("  Maya \n  Okafor ")).toBe("Maya Okafor");
    expect(nameSchema.safeParse("   ").success).toBe(false);
    expect(nameSchema.safeParse("x".repeat(61)).success).toBe(false);
  });

  it("accepts exactly six digits for the OTP", () => {
    expect(otpSchema.safeParse("482193").success).toBe(true);
    expect(otpSchema.safeParse("4821").success).toBe(false);
    expect(otpSchema.safeParse("48219a").success).toBe(false);
  });

  it("reports mismatched passwords on the confirm field", () => {
    const r = signupRequest.safeParse({ name: "Maya", email: "maya@creatorlab.co", password: "clipiro2026", confirmPassword: "clipiro2027" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ confirmPassword: "Passwords don't match" });
  });

  it("maps errors to one message per field", () => {
    const r = loginRequest.safeParse({ email: "nope", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ email: "Enter a valid email address", password: "Enter your password" });
  });
});
