import { describe, expect, it } from "vitest";
import { decodeNextFromState, encodeOAuthState, toInlineScriptJson } from "./oauth-state";

describe("encodeOAuthState / decodeNextFromState round trip", () => {
  it("round-trips a safe internal path, including one with a query string", () => {
    const state = encodeOAuthState("abc123", "/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3");
    expect(state.startsWith("abc123.")).toBe(true);
    expect(decodeNextFromState(state)).toBe("/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3");
  });

  it("round-trips a billing deep link", () => {
    const state = encodeOAuthState("nonce", "/dashboard?billing=1");
    expect(decodeNextFromState(state)).toBe("/dashboard?billing=1");
  });

  it("falls back to a bare nonce (no dot) when next is absent", () => {
    const state = encodeOAuthState("nonce-only", null);
    expect(state).toBe("nonce-only");
    expect(decodeNextFromState(state)).toBeNull();
  });

  it("never encodes an unsafe/external next value — the nonce alone is used instead", () => {
    for (const bad of ["https://evil.com", "//evil.com", "javascript:alert(1)", "/\\evil.com"]) {
      const state = encodeOAuthState("nonce", bad);
      expect(state).toBe("nonce"); // no dot — nothing unsafe made it into the state at all
    }
  });

  it("decodeNextFromState never throws on garbage input", () => {
    expect(() => decodeNextFromState("not-base64.@@@not valid base64url@@@")).not.toThrow();
    expect(() => decodeNextFromState("no-dot-at-all")).not.toThrow();
    expect(() => decodeNextFromState("")).not.toThrow();
  });

  it("decodeNextFromState re-validates even a well-formed but unsafe decoded value", () => {
    // Manually construct a state whose decoded payload is unsafe — simulates
    // a tampered/forged state value reaching the callback (it would also
    // fail the separate CSRF cookie comparison in the real route, but this
    // proves decodeNextFromState doesn't rely on that alone).
    const forgedNext = Buffer.from("https://evil.com", "utf8").toString("base64url");
    expect(decodeNextFromState(`nonce.${forgedNext}`)).toBeNull();
  });
});

describe("toInlineScriptJson", () => {
  it("produces valid, quoted JSON for a normal string", () => {
    expect(toInlineScriptJson("/dashboard")).toBe('"/dashboard"');
  });

  it("escapes an embedded </script> sequence so it cannot terminate the surrounding script block", () => {
    const malicious = "/</script><script>alert(document.cookie)</script>";
    const embedded = toInlineScriptJson(malicious);
    expect(embedded).not.toContain("</script>");
    expect(embedded.toLowerCase()).not.toMatch(/<\/script/);
    // The escaped form still round-trips to the original string when actually parsed as JS/JSON.
    // eslint-disable-next-line no-eval
    expect(JSON.parse(embedded.replace(/\\u003C/g, "<"))).toBe(malicious);
  });

  it("is safe even for a value that independently passed getSafeNextPath (the real attack surface this guards)", async () => {
    const { getSafeNextPath } = await import("./safe-redirect");
    const sneaky = "/</script><script>alert(1)</script>";
    // Confirms the premise: getSafeNextPath alone does NOT reject this —
    // toInlineScriptJson is a genuinely necessary second layer, not redundant.
    expect(getSafeNextPath(sneaky)).toBe(sneaky);
    expect(toInlineScriptJson(sneaky)).not.toContain("</script>");
  });
});
