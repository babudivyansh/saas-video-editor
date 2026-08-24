import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression coverage for P0-1: the route used to echo a caught error's raw
// .message (a third-party STT provider's full error body) straight back to
// the client. It must now always return the sanitized classifyCaptionFailure
// userMessage, while still refunding the spend and logging the real error.

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

const asset = { id: "asset-1", userId: "u1", url: "https://s3.example.com/asset-1.mp4" };
vi.mock("@/lib/prisma", () => ({
  prisma: { asset: { findFirst: vi.fn(async () => asset) } },
}));

const spendCredits = vi.fn(async () => ({ ok: true, balances: { total: 10 } }));
const restoreSpend = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/credits", () => ({ spendCredits: (...a: unknown[]) => spendCredits(...a), restoreSpend: (...a: unknown[]) => restoreSpend(...a) }));

vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async () => {}) }));
vi.mock("@/utils/ffmpeg-render", () => ({ extractAudio: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let transcribeImpl: () => Promise<{ word: string; start: number; end: number }[]>;
vi.mock("@/lib/transcription", () => ({ transcribe: (...a: unknown[]) => transcribeImpl() }));

// Runtime health is real code but env-driven; drive it explicitly so each test
// states the runtime state it is exercising rather than inheriting the test
// environment's (empty) configuration.
const runtimeHealth = vi.hoisted(() => ({
  value: { ok: true, providers: [], reason: null } as {
    ok: boolean;
    providers: { name: string; configured: boolean; shapeValid: boolean; shapeIssue: string | null }[];
    reason: string | null;
  },
}));
// Fully inline (no importOriginal): the real module imports @/lib/env, whose
// schema validation would fail this suite for reasons unrelated to captions.
// The constant values below are pinned against the real module's exports by
// lib/transcription-runtime.test.ts, so this copy cannot drift unnoticed.
vi.mock("@/lib/transcription-runtime", () => ({
  getTranscriptionRuntimeHealth: () => runtimeHealth.value,
  TRANSCRIPTION_RUNTIME_UNAVAILABLE: "TRANSCRIPTION_RUNTIME_UNAVAILABLE",
  TRANSCRIPTION_UNAVAILABLE_MESSAGE: "Caption generation is temporarily unavailable. Please try again shortly.",
}));

const fakeFs = {
  readFileSync: vi.fn(() => Buffer.from("fake-audio")),
  unlinkSync: vi.fn(),
};
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, ...fakeFs, default: { ...actual, ...fakeFs } };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, ...fakeFs, default: { ...actual, ...fakeFs } };
});

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/editor/captions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/editor/captions", () => {
  beforeEach(() => {
    spendCredits.mockClear();
    restoreSpend.mockClear();
    runtimeHealth.value = { ok: true, providers: [], reason: null };
  });

  // ── Runtime gate (P0-1): refuse before charging, not after. ──
  it("refuses WITHOUT spending a credit when no transcription provider is configured", async () => {
    runtimeHealth.value = {
      ok: false,
      reason: "no_provider_configured",
      providers: [{ name: "elevenlabs", configured: false, shapeValid: false, shapeIssue: null }],
    };
    const res = await POST(makeRequest({ assetId: "asset-1" }));
    expect(res.status).toBe(503);
    // The whole point: no charge, and therefore nothing to refund.
    expect(spendCredits).not.toHaveBeenCalled();
    expect(restoreSpend).not.toHaveBeenCalled();
  });

  it("refuses without spending when every configured credential is malformed", async () => {
    runtimeHealth.value = {
      ok: false,
      reason: "all_providers_malformed",
      providers: [{ name: "elevenlabs", configured: true, shapeValid: false, shapeIssue: "is a UUID — that is an ElevenLabs key ID, not an API key" }],
    };
    const res = await POST(makeRequest({ assetId: "asset-1" }));
    expect(res.status).toBe(503);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("leaks no provider, credential or configuration detail when the gate refuses", async () => {
    runtimeHealth.value = {
      ok: false,
      reason: "all_providers_malformed",
      providers: [{ name: "elevenlabs", configured: true, shapeValid: false, shapeIssue: "is a UUID — that is an ElevenLabs key ID, not an API key" }],
    };
    const json = await (await POST(makeRequest({ assetId: "asset-1" }))).json();
    expect(json.message).toBe("Caption generation is temporarily unavailable. Please try again shortly.");
    expect(JSON.stringify(json)).not.toMatch(/elevenlabs|uuid|key id|malformed/i);
  });

  it("returns real word timings on a successful provider", async () => {
    transcribeImpl = async () => [{ word: "hi", start: 0, end: 500 }];
    const res = await POST(makeRequest({ assetId: "asset-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.words).toEqual([{ word: "hi", start: 0, end: 500 }]);
    expect(restoreSpend).not.toHaveBeenCalled();
  });

  it("refunds and returns a sanitized error when every provider fails, never echoing the raw provider error", async () => {
    transcribeImpl = async () => {
      throw new Error(
        'ElevenLabs STT error 400: {"detail":{"type":"authentication_error","code":"invalid_api_key_id_used_as_api_key"}}',
      );
    };
    const res = await POST(makeRequest({ assetId: "asset-1" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).not.toContain("invalid_api_key_id_used_as_api_key");
    expect(json.error).not.toContain("authentication_error");
    expect(json.error).not.toMatch(/\{.*"detail"/);
    expect(restoreSpend).toHaveBeenCalledTimes(1);
    expect(restoreSpend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", reason: "refund:editor-captions-failed" }));
  });

  it("returns a sanitized 'no speech' message and still refunds when no words are found", async () => {
    transcribeImpl = async () => [];
    const res = await POST(makeRequest({ assetId: "asset-1" }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toMatch(/couldn't detect any speech/i);
    expect(restoreSpend).toHaveBeenCalledTimes(1);
  });

  it("401s without spending when unauthenticated", async () => {
    authUser = null;
    const res = await POST(makeRequest({ assetId: "asset-1" }));
    expect(res.status).toBe(401);
    expect(spendCredits).not.toHaveBeenCalled();
    authUser = { userId: "u1" };
  });
});
