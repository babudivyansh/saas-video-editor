// The webhook is the one endpoint where a forged request can permanently stop
// email reaching a user — suppressing an address is exactly what an attacker
// would want. So the signature checks get the same scrutiny as auth.

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  parseResendEvent,
  verifySvixSignature,
  TOLERANCE_SECONDS,
  type ResendEvent,
} from "./resend-webhook";

const SECRET = `whsec_${Buffer.from("super-secret-key").toString("base64")}`;
const ID = "msg_abc123";
const BODY = JSON.stringify({ type: "email.bounced" });

function sign(body: string, timestamp: number, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${ID}.${timestamp}.${body}`).digest("base64");
  return `v1,${sig}`;
}

const NOW = new Date("2026-08-06T12:00:00Z");
const TS = Math.floor(NOW.getTime() / 1000);

describe("verifySvixSignature", () => {
  it("accepts a correctly signed request", () => {
    const headers = { id: ID, timestamp: String(TS), signature: sign(BODY, TS) };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toEqual({ ok: true });
  });

  it("accepts when one of several offered signatures matches, for secret rotation", () => {
    const headers = {
      id: ID,
      timestamp: String(TS),
      signature: `v1,AAAAinvalidAAAA ${sign(BODY, TS)}`,
    };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW).ok).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    const headers = { id: ID, timestamp: String(TS), signature: sign(BODY, TS) };
    const tampered = JSON.stringify({ type: "email.complained" });
    expect(verifySvixSignature(tampered, headers, SECRET, NOW)).toEqual({ ok: false, reason: "no-match" });
  });

  it("rejects a signature made with a different secret", () => {
    const other = `whsec_${Buffer.from("attacker-key").toString("base64")}`;
    const headers = { id: ID, timestamp: String(TS), signature: sign(BODY, TS, other) };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW).ok).toBe(false);
  });

  // Replay protection: a valid request captured off the wire must not stay
  // usable indefinitely.
  it("rejects a timestamp outside the tolerance window", () => {
    const old = TS - TOLERANCE_SECONDS - 1;
    const headers = { id: ID, timestamp: String(old), signature: sign(BODY, old) };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toEqual({ ok: false, reason: "stale-timestamp" });
  });

  it("accepts a timestamp just inside the window, in either direction", () => {
    for (const ts of [TS - TOLERANCE_SECONDS + 1, TS + TOLERANCE_SECONDS - 1]) {
      const headers = { id: ID, timestamp: String(ts), signature: sign(BODY, ts) };
      expect(verifySvixSignature(BODY, headers, SECRET, NOW).ok, `ts=${ts}`).toBe(true);
    }
  });

  // Fail closed. An unconfigured secret must reject rather than wave requests
  // through, or the endpoint becomes an open suppression tool.
  it("rejects everything when no secret is configured", () => {
    const headers = { id: ID, timestamp: String(TS), signature: sign(BODY, TS) };
    expect(verifySvixSignature(BODY, headers, undefined, NOW)).toEqual({ ok: false, reason: "missing-secret" });
  });

  it("rejects when any required header is absent", () => {
    expect(verifySvixSignature(BODY, { id: null, timestamp: String(TS), signature: "v1,x" }, SECRET, NOW).ok).toBe(false);
    expect(verifySvixSignature(BODY, { id: ID, timestamp: null, signature: "v1,x" }, SECRET, NOW).ok).toBe(false);
    expect(verifySvixSignature(BODY, { id: ID, timestamp: String(TS), signature: null }, SECRET, NOW).ok).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    const headers = { id: ID, timestamp: "not-a-number", signature: "v1,x" };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toEqual({ ok: false, reason: "bad-timestamp" });
  });

  it("ignores signature entries of an unknown version", () => {
    const headers = { id: ID, timestamp: String(TS), signature: `v2,${sign(BODY, TS).slice(3)}` };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toEqual({ ok: false, reason: "no-match" });
  });
});

describe("parseResendEvent", () => {
  const event = (type: string, data?: ResendEvent["data"]): ResendEvent => ({ type, data });

  it("treats a hard bounce as permanent", () => {
    const p = parseResendEvent(event("email.bounced", { email_id: "e1", to: ["a@b.com"], bounce: { type: "hard" } }));
    expect(p).toMatchObject({ kind: "bounced", permanent: true, messageId: "e1", recipients: ["a@b.com"] });
  });

  // The distinction that matters most here: a full mailbox is temporary, and
  // suppressing on it would permanently drop a real user.
  it("does NOT treat a soft bounce as permanent", () => {
    const p = parseResendEvent(event("email.bounced", { email_id: "e1", to: ["a@b.com"], bounce: { type: "soft" } }));
    expect(p.permanent).toBe(false);
  });

  it("does not treat an undetermined bounce as permanent", () => {
    const p = parseResendEvent(event("email.bounced", { email_id: "e1", to: ["a@b.com"], bounce: { type: "undetermined" } }));
    expect(p.permanent).toBe(false);
  });

  it("treats a complaint as always permanent", () => {
    const p = parseResendEvent(event("email.complained", { email_id: "e2", to: ["a@b.com"] }));
    expect(p).toMatchObject({ kind: "complained", permanent: true });
  });

  it("records a delivery without suppressing", () => {
    const p = parseResendEvent(event("email.delivered", { email_id: "e3", to: ["a@b.com"] }));
    expect(p).toMatchObject({ kind: "delivered", permanent: false });
  });

  it("ignores event types it does not act on", () => {
    expect(parseResendEvent(event("email.opened", { email_id: "e4" })).kind).toBe("ignored");
  });

  it("normalises a single recipient string into an array", () => {
    expect(parseResendEvent(event("email.delivered", { to: "a@b.com" })).recipients).toEqual(["a@b.com"]);
  });

  it("survives an event with no data at all", () => {
    const p = parseResendEvent(event("email.bounced"));
    expect(p.messageId).toBeNull();
    expect(p.recipients).toEqual([]);
    expect(p.permanent).toBe(false);
  });
});
