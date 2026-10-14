import { describe, expect, it } from "vitest";
import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("alice@gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("b@x.io")).toBe("b***@x.io");
  });

  it("never echoes something that isn't a plain address", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@leading.com")).toBe("***");
    expect(maskEmail("")).toBe("—");
    expect(maskEmail(null)).toBe("—");
  });
});
