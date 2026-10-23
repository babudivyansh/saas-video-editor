import { describe, expect, it } from "vitest";
import { canonicalEmail, isDisposableEmail } from "./email-canonical";

describe("canonicalEmail", () => {
  it("collapses Gmail's dot and plus variants onto one inbox", () => {
    expect(canonicalEmail("A.B+promo@Gmail.com")).toBe("ab@gmail.com");
    expect(canonicalEmail("ab@googlemail.com")).toBe("ab@gmail.com");
  });

  it("drops a +tag everywhere, but keeps dots outside Gmail", () => {
    expect(canonicalEmail("first.last+x@outlook.com")).toBe("first.last@outlook.com");
  });

  it("leaves an ordinary address alone apart from case and spaces", () => {
    expect(canonicalEmail("  Hello@Clipiro.com ")).toBe("hello@clipiro.com");
  });

  // Mirrors the SQL backfill in prisma/migrations/20261023120000_user_canonical_email.
  it("agrees with the migration's backfill rule", () => {
    const sqlRule = (email: string) => {
      const [local, domain] = email.toLowerCase().split("@");
      const base = local.split("+")[0];
      return ["gmail.com", "googlemail.com"].includes(domain) ? `${base.replace(/\./g, "")}@gmail.com` : `${base}@${domain}`;
    };
    for (const e of ["A.B+promo@Gmail.com", "x.y+z@yahoo.co.in", "plain@clipiro.com", "c.d@googlemail.com"]) {
      expect(canonicalEmail(e)).toBe(sqlRule(e));
    }
  });
});

describe("isDisposableEmail", () => {
  it("flags well-known throwaway inboxes and nothing else", () => {
    expect(isDisposableEmail("someone@mailinator.com")).toBe(true);
    expect(isDisposableEmail("someone@YOPMAIL.com")).toBe(true);
    expect(isDisposableEmail("someone@gmail.com")).toBe(false);
  });
});
