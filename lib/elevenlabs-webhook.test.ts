import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { verifyElevenLabsSignature } from "./elevenlabs-webhook";

const SECRET = "whsec_test_secret";

function sign(body: string, timestamp: number, secret = SECRET) {
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("verifyElevenLabsSignature", () => {
  it("accepts a validly signed, fresh payload", () => {
    const body = JSON.stringify({ type: "dub_completed", data: { dubbing_id: "d1" } });
    const now = new Date();
    const header = sign(body, Math.floor(now.getTime() / 1000));
    expect(verifyElevenLabsSignature(body, header, SECRET, now)).toEqual({ ok: true });
  });

  it("rejects when the secret isn't configured", () => {
    const body = "{}";
    const header = sign(body, Math.floor(Date.now() / 1000));
    expect(verifyElevenLabsSignature(body, header, undefined)).toEqual({ ok: false, reason: "not_configured" });
  });

  it("rejects a missing header", () => {
    expect(verifyElevenLabsSignature("{}", null, SECRET)).toEqual({ ok: false, reason: "missing_header" });
  });

  it("rejects a malformed header (no v1 component)", () => {
    expect(verifyElevenLabsSignature("{}", "t=12345", SECRET)).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("rejects a malformed header (non-numeric timestamp)", () => {
    expect(verifyElevenLabsSignature("{}", "t=notanumber,v1=abc", SECRET)).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = "{}";
    const now = new Date();
    const header = sign(body, Math.floor(now.getTime() / 1000), "wrong-secret");
    expect(verifyElevenLabsSignature(body, header, SECRET, now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a signature computed over a different body (tampered payload)", () => {
    const now = new Date();
    const header = sign(JSON.stringify({ a: 1 }), Math.floor(now.getTime() / 1000));
    const tampered = JSON.stringify({ a: 2 });
    expect(verifyElevenLabsSignature(tampered, header, SECRET, now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const body = "{}";
    const staleTs = Math.floor(Date.now() / 1000) - 3600; // 1 hour old, default tolerance is 30 min
    const header = sign(body, staleTs);
    expect(verifyElevenLabsSignature(body, header, SECRET)).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("accepts a timestamp within a custom tolerance", () => {
    const body = "{}";
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000) - 100;
    const header = sign(body, ts);
    expect(verifyElevenLabsSignature(body, header, SECRET, now, 200)).toEqual({ ok: true });
  });

  it("rejects a signature of the wrong length safely (no timingSafeEqual length-mismatch throw)", () => {
    const body = "{}";
    const now = new Date();
    const header = `t=${Math.floor(now.getTime() / 1000)},v1=deadbeef`;
    expect(verifyElevenLabsSignature(body, header, SECRET, now)).toEqual({ ok: false, reason: "bad_signature" });
  });
});
