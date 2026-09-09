import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// lib/env parses process.env at module load, so it has to be mocked before the
// import — same idiom as utils/elevenlabs.test.ts.
const { mockEnv } = vi.hoisted(() => ({ mockEnv: {} as Record<string, string | undefined> }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { verifyWebhookToken, verifyWebhookSignature, extractProviderProjectId } = await import("./SubmagicWebhook");

beforeEach(() => {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
});

describe("verifyWebhookToken", () => {
  it("fails CLOSED when no token is configured", () => {
    // With nothing to compare against there is no way to tell the provider from
    // anyone else, so every request must be rejected — not waved through.
    expect(verifyWebhookToken("anything")).toEqual({ ok: false, reason: "not_configured" });
  });

  it("accepts the configured token and rejects everything else", () => {
    mockEnv.SUBMAGIC_WEBHOOK_TOKEN = "s3cret-path-token";
    expect(verifyWebhookToken("s3cret-path-token")).toEqual({ ok: true });
    expect(verifyWebhookToken("wrong")).toEqual({ ok: false, reason: "bad_token" });
    expect(verifyWebhookToken(undefined)).toEqual({ ok: false, reason: "bad_token" });
  });

  it("rejects a token of a different length without throwing", () => {
    // timingSafeEqual throws on a length mismatch, so length is compared first.
    mockEnv.SUBMAGIC_WEBHOOK_TOKEN = "abcdef";
    expect(() => verifyWebhookToken("ab")).not.toThrow();
    expect(verifyWebhookToken("ab")).toEqual({ ok: false, reason: "bad_token" });
  });
});

describe("verifyWebhookSignature", () => {
  const body = '{"projectId":"p1"}';
  const secret = "whsec_test";
  const sign = (ts: number, b = body) =>
    `t=${ts},v1=${crypto.createHmac("sha256", secret).update(`${ts}.${b}`).digest("hex")}`;

  it("passes through when no secret is configured — the path token is the authenticator", () => {
    expect(verifyWebhookSignature(body, null)).toEqual({ ok: true });
  });

  it("requires a signature once a secret IS configured", () => {
    mockEnv.SUBMAGIC_WEBHOOK_SECRET = secret;
    expect(verifyWebhookSignature(body, null)).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("accepts a valid signature", () => {
    mockEnv.SUBMAGIC_WEBHOOK_SECRET = secret;
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000);
    expect(verifyWebhookSignature(body, sign(ts), now)).toEqual({ ok: true });
  });

  it("rejects a signature over different bytes", () => {
    mockEnv.SUBMAGIC_WEBHOOK_SECRET = secret;
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000);
    expect(verifyWebhookSignature('{"projectId":"p2"}', sign(ts), now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a replayed signature outside the tolerance window", () => {
    mockEnv.SUBMAGIC_WEBHOOK_SECRET = secret;
    const now = new Date();
    const old = Math.floor(now.getTime() / 1000) - 60 * 60;
    expect(verifyWebhookSignature(body, sign(old), now)).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a malformed header", () => {
    mockEnv.SUBMAGIC_WEBHOOK_SECRET = secret;
    expect(verifyWebhookSignature(body, "garbage").ok).toBe(false);
    expect(verifyWebhookSignature(body, "t=abc,v1=def").ok).toBe(false);
  });
});

describe("extractProviderProjectId", () => {
  it("reads the id under any of the plausible field names", () => {
    expect(extractProviderProjectId({ projectId: "a" })).toBe("a");
    expect(extractProviderProjectId({ project_id: "b" })).toBe("b");
    expect(extractProviderProjectId({ id: "c" })).toBe("c");
  });

  it("looks one level into a nested data envelope", () => {
    expect(extractProviderProjectId({ event: "render.done", data: { projectId: "d" } })).toBe("d");
  });

  it("returns null for anything it can't find an id in", () => {
    expect(extractProviderProjectId(null)).toBeNull();
    expect(extractProviderProjectId("string")).toBeNull();
    expect(extractProviderProjectId({})).toBeNull();
    expect(extractProviderProjectId({ projectId: "" })).toBeNull();
  });

  it("bounds an absurdly long id rather than passing it to a DB lookup", () => {
    expect(extractProviderProjectId({ projectId: "x".repeat(500) })).toBeNull();
  });
});
