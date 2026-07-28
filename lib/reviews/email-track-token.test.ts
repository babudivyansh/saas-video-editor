import { describe, expect, it } from "vitest";
import { signTrackToken, verifyTrackToken } from "./email-track-token";

describe("signTrackToken / verifyTrackToken", () => {
  it("round-trips userId and stage", () => {
    const token = signTrackToken("u1", 2);
    expect(verifyTrackToken(token)).toEqual({ userId: "u1", stage: 2 });
  });

  it("rejects a tampered token", () => {
    const token = signTrackToken("u1", 1);
    expect(verifyTrackToken(token.slice(0, -2) + "xx")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifyTrackToken("not-a-jwt")).toBeNull();
  });
});
