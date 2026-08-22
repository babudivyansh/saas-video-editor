import { describe, expect, it } from "vitest";
import { getSafeNextPath, withNextParam } from "./safe-redirect";

describe("getSafeNextPath", () => {
  it("accepts a plain internal path", () => {
    expect(getSafeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("accepts an internal path with a query string", () => {
    expect(getSafeNextPath("/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3")).toBe(
      "/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3",
    );
  });

  it("accepts a billing deep link", () => {
    expect(getSafeNextPath("/dashboard?billing=1")).toBe("/dashboard?billing=1");
  });

  it("rejects null/undefined/empty", () => {
    expect(getSafeNextPath(null)).toBeNull();
    expect(getSafeNextPath(undefined)).toBeNull();
    expect(getSafeNextPath("")).toBeNull();
  });

  it("rejects a full external URL", () => {
    expect(getSafeNextPath("https://evil.com")).toBeNull();
    expect(getSafeNextPath("http://evil.com/dashboard")).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(getSafeNextPath("//evil.com")).toBeNull();
    expect(getSafeNextPath("//evil.com/dashboard")).toBeNull();
  });

  it("rejects a backslash-based protocol-relative trick", () => {
    expect(getSafeNextPath("/\\evil.com")).toBeNull();
    expect(getSafeNextPath("\\\\evil.com")).toBeNull();
  });

  it("rejects a bare javascript:/data: scheme (no leading slash)", () => {
    expect(getSafeNextPath("javascript:alert(1)")).toBeNull();
    expect(getSafeNextPath("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("accepts a leading-slash path that merely contains a colon later (browsers resolve this as a same-origin path, never as a javascript: URI)", () => {
    expect(getSafeNextPath("/javascript:alert(1)")).toBe("/javascript:alert(1)");
  });

  it("rejects a path not starting with a single slash", () => {
    expect(getSafeNextPath("dashboard")).toBeNull();
    expect(getSafeNextPath("evil.com/dashboard")).toBeNull();
  });

  it("rejects values containing control characters (tab/newline smuggling)", () => {
    expect(getSafeNextPath("/\tjavascript:alert(1)")).toBeNull();
    expect(getSafeNextPath("/\n//evil.com")).toBeNull();
  });

  it("rejects an embedded scheme anywhere in the value", () => {
    expect(getSafeNextPath("/redirect?to=https://evil.com")).toBeNull();
  });

  it("rejects an absurdly long value", () => {
    expect(getSafeNextPath("/" + "a".repeat(3000))).toBeNull();
  });
});

describe("withNextParam", () => {
  it("appends a validated next param", () => {
    expect(withNextParam("/login", "/dashboard/editor?projectId=abc")).toBe(
      "/login?next=%2Fdashboard%2Feditor%3FprojectId%3Dabc",
    );
  });

  it("uses & when the target already has a query string", () => {
    expect(withNextParam("/login?mode=register", "/dashboard")).toBe("/login?mode=register&next=%2Fdashboard");
  });

  it("returns the target unchanged when next is unsafe", () => {
    expect(withNextParam("/login", "https://evil.com")).toBe("/login");
    expect(withNextParam("/login", null)).toBe("/login");
  });
});
