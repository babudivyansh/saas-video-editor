import { describe, expect, it } from "vitest";
import { NAME_MAX, PASSWORD_MAX_BYTES, PASSWORD_MIN, emailSchema, nameSchema, passwordSchema } from "@clipiro/shared";
import * as web from "./auth-validation";

// The Android app validates forms with @clipiro/shared's zod schemas; the web
// API with lib/auth-validation.ts. Same samples through both: they must agree,
// or the app would accept input the server rejects (or the reverse).

describe("@clipiro/shared auth schemas agree with lib/auth-validation", () => {
  it("shares the limits", () => {
    expect([NAME_MAX, PASSWORD_MIN, PASSWORD_MAX_BYTES]).toEqual([web.NAME_MAX, web.PASSWORD_MIN, web.PASSWORD_MAX_BYTES]);
  });

  it.each(["maya@creatorlab.co", " Maya@CreatorLab.CO ", "a@b.c", "no-at-sign", "a@b", "a b@c.d", "", `${"x".repeat(250)}@a.io`])(
    "email %j",
    (raw) => {
      const webOk = web.isValidEmail(web.normalizeEmail(raw));
      expect(emailSchema.safeParse(raw).success).toBe(webOk);
    },
  );

  it.each(["", "1234567", "abcdefgh", "clipiro2026", "a".repeat(72), "a".repeat(73), "€".repeat(24), "€".repeat(25)])(
    "password %j",
    (pw) => {
      expect(passwordSchema.safeParse(pw).success).toBe(web.validatePassword(pw) === null);
    },
  );

  it.each(["Maya Okafor", "  Maya \n Okafor  ", "", "   ", "x".repeat(60), "x".repeat(61), "a\u0007b"])("name %j", (raw) => {
    const webName = web.cleanName(raw);
    const r = nameSchema.safeParse(raw);
    expect(r.success).toBe(web.validateName(webName) === null);
    if (r.success) expect(r.data).toBe(webName);
  });
});
