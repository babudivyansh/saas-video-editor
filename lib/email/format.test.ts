import { describe, expect, it } from "vitest";
import { formatMinor } from "./format";

describe("formatMinor", () => {
  it("formats INR paise as rupees", () => {
    expect(formatMinor(219900, "INR")).toMatch(/₹\s?2,199/);
  });
  it("formats USD cents as dollars", () => {
    expect(formatMinor(2900, "USD")).toBe("$29");
    expect(formatMinor(2899, "USD")).toBe("$28.99");
  });
  it("defaults to INR", () => {
    expect(formatMinor(100000)).toMatch(/₹\s?1,000/);
  });
});
