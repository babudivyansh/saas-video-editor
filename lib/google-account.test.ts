import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/account-claim", () => ({ claimUnverifiedAccount: vi.fn() }));
vi.mock("@/lib/minutes", () => ({ grantFreeTierMinutes: vi.fn() }));
vi.mock("@/lib/affiliate", () => ({ attributeReferral: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "unknown" }));

const { GoogleTokenError, resetGoogleCertCache, verifyGoogleIdToken } = await import("./google-account");

// A stand-in for Google's signing key, published the way Google publishes
// its certs: { kid: PEM }.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const sign = (claims: Record<string, unknown>, opts: jwt.SignOptions = {}) =>
  jwt.sign({ email: "maya@creatorlab.co", email_verified: true, ...claims }, privateKey, {
    algorithm: "RS256",
    keyid: "k1",
    issuer: "https://accounts.google.com",
    audience: "web-client",
    expiresIn: 600,
    ...opts,
  });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetGoogleCertCache();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ k1: PEM }), { headers: { "cache-control": "public, max-age=3600" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("verifyGoogleIdToken", () => {
  it("accepts a token Google signed for one of our client IDs", async () => {
    const profile = await verifyGoogleIdToken(sign({}), ["android-client", "web-client"]);
    expect(profile).toMatchObject({ email: "maya@creatorlab.co", email_verified: true });
  });

  it("caches Google's certs", async () => {
    await verifyGoogleIdToken(sign({}), ["web-client"]);
    await verifyGoogleIdToken(sign({}), ["web-client"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another app's client ID", sign({}, { audience: "someone-else" })],
    ["a different issuer", sign({}, { issuer: "https://evil.example" })],
    ["an expired token", sign({}, { expiresIn: -60 })],
    ["an unknown signing key", sign({}, { keyid: "k2" })],
    ["a token signed with HS256", jwt.sign({ email: "x" }, "secret", { algorithm: "HS256", keyid: "k1", audience: "web-client", issuer: "accounts.google.com" })],
    ["garbage", "not.a.jwt"],
  ])("refuses %s", async (_label, token) => {
    await expect(verifyGoogleIdToken(token, ["web-client"])).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it("refuses everything when no client ID is configured", async () => {
    await expect(verifyGoogleIdToken(sign({}), [])).rejects.toBeInstanceOf(GoogleTokenError);
  });
});
