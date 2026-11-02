// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, upsert, fetchMock } = vi.hoisted(() => ({
  findUnique: vi.fn(async () => null as { value: string } | null),
  upsert: vi.fn(async () => ({})),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { config: { findUnique, upsert } } }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { ELEVENLABS_API_KEY: "sk_test" } }));
vi.mock("@/utils/elevenlabs", () => ({ isElevenLabsConfigured: () => true }));
vi.mock("./libraryProviderIds", () => ({
  LIBRARY_PROVIDER_IDS: { "en-a": "AAAAAAAAAAAAAAAAAAAA", "en-b": "BBBBBBBBBBBBBBBBBBBB", "en-c": "CCCCCCCCCCCCCCCCCCCC" },
}));

vi.stubGlobal("fetch", fetchMock);
const { runLibrarySync } = await import("./library-sync");

const saved = () => JSON.parse((upsert.mock.calls.at(-1) as unknown as [{ update: { value: string } }])[0].update.value) as string[];

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(null);
});

describe("runLibrarySync", () => {
  it("records voices ElevenLabs no longer knows", async () => {
    fetchMock.mockImplementation(async (url: string) => new Response("", { status: url.includes("BBBB") ? 400 : 200 }));
    const r = await runLibrarySync();
    expect(r.missing).toEqual(["en-b"]);
    expect(saved()).toEqual(["en-b"]);
  });

  it("never hides a voice on a rate limit or outage — it keeps yesterday's answer", async () => {
    findUnique.mockResolvedValue({ value: JSON.stringify(["en-c"]) });
    fetchMock.mockImplementation(async (url: string) =>
      new Response("", { status: url.includes("AAAA") ? 429 : url.includes("CCCC") ? 503 : 200 }));
    const r = await runLibrarySync();
    // en-a: unknown and not missing before -> stays shown; en-c: unknown, was missing -> stays hidden.
    expect(r.missing).toEqual(["en-c"]);
    expect(r.unknown).toBe(2);
  });
});
