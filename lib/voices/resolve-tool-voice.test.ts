import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveToolVoice: catalogue voices, or the caller's OWN cloned voices —
// never an arbitrary provider id (resolveVoiceId/resolveVoiceRef let any
// 20-character id through: any voice on our account, anyone's clone).

let ownClone: string | null = null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clonedVoice: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; elevenLabsVoiceId: string } }) =>
        where.userId === "u1" && where.elevenLabsVoiceId === ownClone ? { id: "c1" } : null),
    },
  },
}));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(async () => null), set: vi.fn(async () => "OK"), del: vi.fn() } }));
vi.mock("./sync", () => ({ getKnownAccountVoices: vi.fn(async () => null) }));

const { resolveToolVoice } = await import("./registry");

beforeEach(() => { ownClone = null; });

describe("resolveToolVoice", () => {
  it("resolves a catalogue slug", async () => {
    const v = await resolveToolVoice("u1", "brian");
    expect(v?.source).toBe("catalog");
    expect(v?.providerVoiceId).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it("allows a raw id only when it is the caller's own clone", async () => {
    ownClone = "AbCdEfGhIjKlMnOpQrSt";
    expect(await resolveToolVoice("u1", "AbCdEfGhIjKlMnOpQrSt")).toMatchObject({ source: "raw" });
    expect(await resolveToolVoice("u2", "AbCdEfGhIjKlMnOpQrSt")).toBeNull();
  });

  it("rejects ids that aren't ours to use and path-like input", async () => {
    expect(await resolveToolVoice("u1", "ZzZzZzZzZzZzZzZzZzZz")).toBeNull();
    expect(await resolveToolVoice("u1", "../../v1/voices/add")).toBeNull();
  });
});
