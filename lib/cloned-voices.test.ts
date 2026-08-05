import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000", ELEVENLABS_API_KEY: "k" },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

let rows: Array<{ id: string; userId: string; name: string; elevenLabsVoiceId: string; createdAt: Date }>;
let idCounter = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clonedVoice: {
      count: vi.fn(async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId).length),
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId)),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null),
      create: vi.fn(async ({ data }: { data: { userId: string; name: string; elevenLabsVoiceId: string } }) => {
        const row = { id: `cv${++idCounter}`, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        rows = rows.filter((r) => r.id !== where.id);
      }),
    },
  },
}));

let slotsRemaining = 50;
const cloneVoiceMock = vi.fn(async (name: string) => ({ voiceId: `voice_${name}` }));
const deleteClonedVoiceMock = vi.fn(async () => {});

vi.mock("@/utils/elevenlabs", () => ({
  cloneVoice: (...args: [string, Buffer, string]) => cloneVoiceMock(...args),
  deleteClonedVoice: (...args: [string]) => deleteClonedVoiceMock(...args),
  elevenLabsVoiceSlotsRemaining: async () => slotsRemaining,
}));

const { addClonedVoice, removeClonedVoice, listClonedVoices, MAX_CLONED_VOICES_PER_USER } = await import("./cloned-voices");

beforeEach(() => {
  rows = [];
  idCounter = 0;
  slotsRemaining = 50;
  cloneVoiceMock.mockClear();
  deleteClonedVoiceMock.mockClear();
});

describe("addClonedVoice", () => {
  it("clones a voice and persists it", async () => {
    const result = await addClonedVoice("u1", "My Voice", Buffer.from("audio"), "sample.mp3");
    expect(result).toEqual({ ok: true, id: "cv1", voiceId: "voice_My Voice" });
    expect(cloneVoiceMock).toHaveBeenCalledWith("My Voice", expect.any(Buffer), "sample.mp3");
    const list = await listClonedVoices("u1");
    expect(list).toHaveLength(1);
  });

  it("rejects an empty name without calling ElevenLabs", async () => {
    const result = await addClonedVoice("u1", "   ", Buffer.from("audio"), "sample.mp3");
    expect(result).toEqual({ ok: false, error: "Name your voice before cloning.", status: 400 });
    expect(cloneVoiceMock).not.toHaveBeenCalled();
  });

  it(`enforces the per-user cap of ${MAX_CLONED_VOICES_PER_USER}`, async () => {
    for (let i = 0; i < MAX_CLONED_VOICES_PER_USER; i++) {
      const r = await addClonedVoice("u1", `Voice ${i}`, Buffer.from("audio"), "s.mp3");
      expect(r.ok).toBe(true);
    }
    const over = await addClonedVoice("u1", "One too many", Buffer.from("audio"), "s.mp3");
    expect(over).toEqual({
      ok: false,
      error: `You can have up to ${MAX_CLONED_VOICES_PER_USER} cloned voices.`,
      status: 409,
    });
    expect(cloneVoiceMock).toHaveBeenCalledTimes(MAX_CLONED_VOICES_PER_USER);
  });

  it("does not enforce the cap across different users", async () => {
    for (let i = 0; i < MAX_CLONED_VOICES_PER_USER; i++) {
      await addClonedVoice("u1", `Voice ${i}`, Buffer.from("audio"), "s.mp3");
    }
    const otherUser = await addClonedVoice("u2", "First voice", Buffer.from("audio"), "s.mp3");
    expect(otherUser.ok).toBe(true);
  });

  it("blocks cloning before calling ElevenLabs when the shared account is nearly full", async () => {
    slotsRemaining = 2; // below the safety margin
    const result = await addClonedVoice("u1", "My Voice", Buffer.from("audio"), "sample.mp3");
    expect(result).toEqual({
      ok: false,
      error: "Voice cloning is temporarily unavailable — please try again later.",
      status: 503,
    });
    expect(cloneVoiceMock).not.toHaveBeenCalled();
  });

  it("surfaces a clear error and does not persist anything when the ElevenLabs call fails", async () => {
    cloneVoiceMock.mockRejectedValueOnce(new Error("vendor 500"));
    const result = await addClonedVoice("u1", "My Voice", Buffer.from("audio"), "sample.mp3");
    expect(result.ok).toBe(false);
    expect(await listClonedVoices("u1")).toHaveLength(0);
  });
});

describe("removeClonedVoice", () => {
  it("deletes the DB row and the ElevenLabs voice", async () => {
    const added = await addClonedVoice("u1", "My Voice", Buffer.from("audio"), "sample.mp3");
    if (!added.ok) throw new Error("setup failed");
    const removed = await removeClonedVoice("u1", added.id);
    expect(removed).toBe(true);
    expect(deleteClonedVoiceMock).toHaveBeenCalledWith(added.voiceId);
    expect(await listClonedVoices("u1")).toHaveLength(0);
  });

  it("returns false and does not touch ElevenLabs for another user's voice", async () => {
    const added = await addClonedVoice("u1", "My Voice", Buffer.from("audio"), "sample.mp3");
    if (!added.ok) throw new Error("setup failed");
    const removed = await removeClonedVoice("u2", added.id);
    expect(removed).toBe(false);
    expect(deleteClonedVoiceMock).not.toHaveBeenCalled();
  });

  it("still deletes the DB row even if the ElevenLabs delete call fails", async () => {
    const added = await addClonedVoice("u1", "My Voice", Buffer.from("audio"), "sample.mp3");
    if (!added.ok) throw new Error("setup failed");
    deleteClonedVoiceMock.mockRejectedValueOnce(new Error("vendor 500"));
    const removed = await removeClonedVoice("u1", added.id);
    expect(removed).toBe(true);
    expect(await listClonedVoices("u1")).toHaveLength(0);
  });
});
