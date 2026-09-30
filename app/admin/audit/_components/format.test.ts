import { describe, expect, it } from "vitest";
import { describeDevice, diffSnapshots, fieldLabel, formatValue, linkFor } from "./format";

describe("linkFor", () => {
  it("links id-valued fields to what they point at, including nested paths", () => {
    expect(linkFor("userId", "ef4e8b65-b8bb-44eb-88ac-f97cdd4c68f1")).toBe("/admin/users/ef4e8b65-b8bb-44eb-88ac-f97cdd4c68f1");
    expect(linkFor("before.reviewId", "rev-12345678")).toBe("/admin/reviews/rev-12345678");
    expect(linkFor("planId", "b6f9759a-2c91-492d-98a5-8d76969cfeba")).toBe("/admin/pricing");
  });

  it("leaves other fields and non-id values alone", () => {
    expect(linkFor("name", "ef4e8b65-b8bb-44eb-88ac-f97cdd4c68f1")).toBeNull();
    expect(linkFor("userId", "short")).toBeNull();
    expect(linkFor("userId", "has spaces in it")).toBeNull();
    expect(linkFor("userId", 42)).toBeNull();
  });
});

describe("diffSnapshots", () => {
  it("lists changed fields first, with nested objects as dotted paths", () => {
    const d = diffSnapshots(
      { code: "SAVE20", discountValue: 10, limits: { maxUses: 100 } },
      { code: "SAVE20", discountValue: 20, limits: { maxUses: 50 }, active: false },
    );
    expect(d.map((c) => [c.path, c.kind])).toEqual([
      ["discountValue", "changed"],
      ["limits.maxUses", "changed"],
      ["active", "added"],
      ["code", "same"],
    ]);
  });

  it("treats a field missing from a partial `after` as untouched, not removed", () => {
    const d = diffSnapshots({ role: "ADMIN", credits: 74 }, { credits: 80 });
    expect(d.map((c) => [c.path, c.kind])).toEqual([["credits", "changed"], ["role", "unrecorded"]]);
  });

  it("reads a one-sided snapshot (create / delete) as all added / all removed", () => {
    expect(diffSnapshots(null, { a: 1 })).toEqual([{ path: "a", before: undefined, after: 1, kind: "added" }]);
    expect(diffSnapshots({ a: 1 }, null)[0].kind).toBe("removed");
  });

  it("handles a non-object value", () => {
    expect(diffSnapshots(false, true)).toEqual([{ path: "value", before: false, after: true, kind: "changed" }]);
  });
});

describe("formatValue / fieldLabel / describeDevice", () => {
  it("formats paise, booleans, dates and empties", () => {
    expect(formatValue("amountInPaise", 99900)).toBe("₹999");
    expect(formatValue("active", false)).toBe("Off");
    expect(formatValue("x", null)).toBe("—");
    expect(formatValue("tags", [])).toBe("(none)");
    expect(formatValue("endsAt", "2026-09-30T10:00:00.000Z")).not.toContain("T10");
  });

  it("labels fields for people", () => {
    expect(fieldLabel("amountInPaise")).toBe("Amount");
    expect(fieldLabel("limits.maxUses")).toBe("Limits › Max uses");
  });

  it("names the device", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice(null)).toBeNull();
  });
});
