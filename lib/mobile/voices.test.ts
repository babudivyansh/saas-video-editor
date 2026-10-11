// @vitest-environment node
//
// My Voices on the server: cloning only when switched on, only from the
// person's own audio in Assets, and a cloned voice usable only by its owner.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { VOICE_CLONING_ENABLED: "true" as string | undefined },
  asset: vi.fn(),
  clone: vi.fn(),
  cloneUpdate: vi.fn(),
  add: vi.fn(),
  download: vi.fn(async () => Buffer.from("sample")),
}));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findFirst: h.asset }, clonedVoice: { findFirst: h.clone, update: h.cloneUpdate } } }));
vi.mock("@/lib/cloned-voices", () => ({ addClonedVoice: h.add, listClonedVoices: vi.fn(async () => [{ id: "cv1", name: "Maya", createdAt: new Date("2026-10-01") }]) }));
vi.mock("@/utils/s3-upload", () => ({ downloadS3ObjectToBuffer: h.download }));

const v = await import("./voices");
const AUDIO = { name: "me.m4a", s3Key: "u1/me.m4a", kind: "audio", size: 2_000_000, status: "ready" };

beforeEach(() => {
  vi.clearAllMocks();
  h.env.VOICE_CLONING_ENABLED = "true";
  h.asset.mockResolvedValue(AUDIO);
  h.add.mockResolvedValue({ ok: true, id: "cv9", voiceId: "el_new" });
});

describe("voices", () => {
  it("lists clones as clone:<id>", async () => {
    expect(await v.listClones("u1")).toEqual([{ id: "clone:cv1", name: "Maya", createdAt: "2026-10-01T00:00:00.000Z" }]);
  });

  it("resolves a catalogue voice as it is, and a clone only for its owner", async () => {
    expect(await v.resolveVoiceRef("u1", "brian")).toBe("brian");
    h.clone.mockResolvedValueOnce({ elevenLabsVoiceId: "el_maya" });
    expect(await v.resolveVoiceRef("u1", "clone:cv1")).toBe("el_maya");
    expect(h.clone).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cv1", userId: "u1" } }));
    h.clone.mockResolvedValueOnce(null);
    expect(await v.resolveVoiceRef("u2", "clone:cv1")).toBeNull();
  });

  it("says coming soon while cloning is switched off, before touching anything", async () => {
    h.env.VOICE_CLONING_ENABLED = undefined;
    await expect(v.cloneFromAsset("u1", "Maya", "a1")).rejects.toMatchObject({ status: 503, code: "cloning_unavailable" });
    expect(h.asset).not.toHaveBeenCalled();
  });

  it("clones from the person's own audio sample", async () => {
    const voice = await v.cloneFromAsset("u1", " Maya — warm ", "a1");
    expect(h.asset).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", userId: "u1", archivedAt: null } }));
    expect(h.add).toHaveBeenCalledWith("u1", " Maya — warm ", Buffer.from("sample"), "me.m4a");
    expect(voice).toMatchObject({ id: "clone:cv9", name: "Maya — warm" });
  });

  it("refuses an image, a huge file, and the cap", async () => {
    h.asset.mockResolvedValueOnce({ ...AUDIO, kind: "image" });
    await expect(v.cloneFromAsset("u1", "Maya", "a1")).rejects.toMatchObject({ code: "wrong_kind" });
    h.asset.mockResolvedValueOnce({ ...AUDIO, size: 50_000_000 });
    await expect(v.cloneFromAsset("u1", "Maya", "a1")).rejects.toMatchObject({ code: "too_big" });
    h.add.mockResolvedValueOnce({ ok: false, error: "You can have up to 3 cloned voices.", status: 409 });
    await expect(v.cloneFromAsset("u1", "Maya", "a1")).rejects.toMatchObject({ status: 409, code: "voice_limit" });
  });

  it("renames only the person's own voice", async () => {
    h.clone.mockResolvedValueOnce(null);
    await expect(v.renameClone("u1", "clone:theirs", "Mine")).rejects.toMatchObject({ status: 404 });
  });
});
