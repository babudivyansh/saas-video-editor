// P0-1 regression protection. The incident: production had a transcription
// credential that was actually a key *ID*, so every caption request charged a
// credit, did real work, failed on auth, and refunded. Nothing detected the
// misconfiguration until users hit it — the same shape as the P0-2 ffmpeg
// outage.
//
// These tests pin two things: obviously-broken configuration is detected
// without a network call, and a doubtful-but-plausible credential is NOT
// refused (a false negative here would block a working deployment, which is
// worse than letting one through to the provider).

import { describe, expect, it, vi, beforeEach } from "vitest";

const envMock = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
vi.mock("@/lib/env", () => ({ get env() { return envMock.value; } }));

const {
  describeProviders,
  getTranscriptionRuntimeHealth,
  TRANSCRIPTION_UNAVAILABLE_MESSAGE,
} = await import("./transcription-runtime");

const REAL_EL = "sk_" + "a".repeat(48);
const REAL_OPENAI = "sk-" + "b".repeat(45);
const REAL_FAL = "11111111-2222-3333-4444-555555555555:" + "c".repeat(32);

beforeEach(() => { envMock.value = {}; });

describe("credential shape inspection", () => {
  it("flags a UUID ElevenLabs value as a key ID, not an API key — the actual P0-1 cause", () => {
    envMock.value = { ELEVENLABS_API_KEY: "3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071" };
    const el = describeProviders().find((p) => p.name === "elevenlabs")!;
    expect(el.configured).toBe(true);
    expect(el.shapeValid).toBe(false);
    expect(el.shapeIssue).toMatch(/key ID, not an API key/i);
  });

  it("accepts a well-formed credential for each provider", () => {
    envMock.value = { ELEVENLABS_API_KEY: REAL_EL, OPENAI_API_KEY: REAL_OPENAI, FAL_KEY: REAL_FAL };
    for (const p of describeProviders()) {
      expect(`${p.name}:${p.shapeValid}`).toBe(`${p.name}:true`);
      expect(p.shapeIssue).toBeNull();
    }
  });

  it("rejects placeholders, whitespace-padded values, and stubs", () => {
    envMock.value = { ELEVENLABS_API_KEY: "your-api-key-here", OPENAI_API_KEY: `  ${REAL_OPENAI}  `, FAL_KEY: "changeme" };
    const [el, oa, fal] = describeProviders();
    expect(el.shapeValid).toBe(false);
    expect(oa.shapeValid).toBe(false);
    expect(oa.shapeIssue).toMatch(/whitespace/i);
    expect(fal.shapeValid).toBe(false);
  });

  it("rejects an OpenAI key without the sk- prefix and a fal key without the id:secret separator", () => {
    // "q", not "x" — an "xxx..." fixture trips the placeholder rule first and
    // would test the wrong branch.
    envMock.value = { OPENAI_API_KEY: "q".repeat(50), FAL_KEY: "q".repeat(50) };
    const [, oa, fal] = describeProviders();
    expect(oa.shapeIssue).toMatch(/sk-/);
    expect(fal.shapeIssue).toMatch(/separator/i);
  });

  it("never exposes any part of the credential value in its report", () => {
    const secret = "sk_supersecretvalue" + "z".repeat(40);
    envMock.value = { ELEVENLABS_API_KEY: secret };
    const serialized = JSON.stringify(describeProviders());
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("supersecret");
  });
});

describe("runtime health gate", () => {
  it("refuses when nothing is configured", () => {
    const h = getTranscriptionRuntimeHealth();
    expect(h.ok).toBe(false);
    expect(h.reason).toBe("no_provider_configured");
  });

  it("refuses when every configured credential is obviously malformed", () => {
    envMock.value = { ELEVENLABS_API_KEY: "3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071", OPENAI_API_KEY: "nope" };
    const h = getTranscriptionRuntimeHealth();
    expect(h.ok).toBe(false);
    expect(h.reason).toBe("all_providers_malformed");
  });

  it("PERMITS when a broken primary is backed by a well-formed fallback — the chain must still get its chance", () => {
    envMock.value = { ELEVENLABS_API_KEY: "3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071", OPENAI_API_KEY: REAL_OPENAI };
    const h = getTranscriptionRuntimeHealth();
    expect(h.ok).toBe(true);
    expect(h.reason).toBeNull();
  });

  it("permits a well-formed credential without predicting whether it will authenticate", () => {
    // Deliberate: shape validity is not a claim about the provider accepting
    // it. Refusing here on a guess would block working deployments.
    envMock.value = { ELEVENLABS_API_KEY: REAL_EL };
    expect(getTranscriptionRuntimeHealth().ok).toBe(true);
  });
});

describe("user-facing message", () => {
  it("is sanitized — no provider, credential or configuration detail", () => {
    expect(TRANSCRIPTION_UNAVAILABLE_MESSAGE).toBe("Caption generation is temporarily unavailable. Please try again shortly.");
    expect(TRANSCRIPTION_UNAVAILABLE_MESSAGE).not.toMatch(/elevenlabs|openai|fal|key|credential|api|provider/i);
  });
});
