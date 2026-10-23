import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsp } from "./csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

afterEach(() => vi.unstubAllEnvs());

describe("buildCsp", () => {
  it("has no 'unsafe-eval' in production, and no nonce that would void 'unsafe-inline'", () => {
    vi.stubEnv("NODE_ENV", "production");
    const script = directive(buildCsp(), "script-src");
    expect(script).not.toContain("unsafe-eval");
    expect(script).not.toContain("nonce-");
    expect(script).toContain("'unsafe-inline'");
    expect(script).toContain("https://checkout.razorpay.com");
    expect(script).toContain("https://*.razorpay.com"); // checkout.js loads cdn.razorpay.com scripts
  });

  it("allows 'unsafe-eval' under next dev only (React's dev error stacks)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(directive(buildCsp(), "script-src")).toContain("'unsafe-eval'");
  });

  it("lets the browser fetch and play S3 media, and local blob previews", () => {
    const csp = buildCsp();
    for (const d of ["connect-src", "media-src", "img-src"]) {
      expect(directive(csp, d)).toContain("https://*.amazonaws.com");
      expect(directive(csp, d)).toContain("blob:");
    }
    expect(directive(csp, "media-src")).toContain("https://storage.googleapis.com"); // voice previews
  });

  it("adds the asset CDN's origin when one is configured", () => {
    vi.stubEnv("CDN_BASE_URL", "https://cdn.clipiro.com/assets/");
    const csp = buildCsp();
    for (const d of ["connect-src", "media-src", "img-src"]) expect(directive(csp, d)).toContain("https://cdn.clipiro.com");
    expect(directive(csp, "connect-src")).not.toContain("/assets");
  });

  it("ignores an unset or malformed CDN_BASE_URL", () => {
    vi.stubEnv("CDN_BASE_URL", "not a url");
    expect(buildCsp()).not.toContain("not a url");
    expect(buildCsp()).not.toContain("null");
  });
});
