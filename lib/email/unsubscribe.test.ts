import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signUnsubToken, verifyUnsubToken, unsubscribeUrl } from "./unsubscribe";

describe("unsubscribe tokens", () => {
  it("round-trips a user and category", () => {
    const token = signUnsubToken("user_123", "marketingEmails");
    expect(verifyUnsubToken(token)).toEqual({ userId: "user_123", category: "marketingEmails" });
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign(
      { userId: "user_123", category: "marketingEmails", purpose: "email-unsub" },
      "not-the-real-secret",
    );
    expect(verifyUnsubToken(forged)).toBeNull();
  });

  // The purpose claim is what stops a token minted for one job being replayed
  // against another. The review-drip tracker uses the same secret.
  it("rejects a correctly-signed token issued for a different purpose", () => {
    const wrongPurpose = jwt.sign(
      { userId: "user_123", stage: 1, purpose: "review-email-track" },
      process.env.JWT_SECRET!,
    );
    expect(verifyUnsubToken(wrongPurpose)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyUnsubToken("not-a-token")).toBeNull();
    expect(verifyUnsubToken("")).toBeNull();
  });

  /**
   * The security property this token shape exists for: getAuthUser rejects any
   * token without a sessionId (lib/auth.ts:176), so even if one of these were
   * routed through the real session path it could not authenticate anyone.
   */
  it("carries no sessionId, so it can never act as a session token", () => {
    const decoded = jwt.decode(signUnsubToken("user_123", "usageAlerts")) as Record<string, unknown>;
    expect(decoded.sessionId).toBeUndefined();
    expect(decoded.email).toBeUndefined();
    expect(decoded.purpose).toBe("email-unsub");
  });

  it("builds a URL with the token escaped into the query string", () => {
    const url = unsubscribeUrl("user_123", "reviewPrompts");
    expect(url).toContain("/api/email/unsubscribe?t=");
    const token = new URL(url).searchParams.get("t")!;
    expect(verifyUnsubToken(token)?.category).toBe("reviewPrompts");
  });
});
