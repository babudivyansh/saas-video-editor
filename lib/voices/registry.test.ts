// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { configFindUnique, redisGet, redisSet, redisDel, listVoices, configured } = vi.hoisted(() => ({
  configFindUnique: vi.fn(async () => null as { value: string } | null),
  redisGet: vi.fn(async () => null as string | null),
  redisSet: vi.fn(async () => {}),
  redisDel: vi.fn(async () => {}),
  listVoices: vi.fn(async () => [] as { voice_id: string; name: string; preview_url?: string }[]),
  configured: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { config: { findUnique: configFindUnique } } }));
vi.mock("@/lib/redis", () => ({ redis: { get: redisGet, set: redisSet, del: redisDel } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/utils/elevenlabs", () => ({
  listVoices: (...a: unknown[]) => listVoices(...(a as [])),
  isElevenLabsConfigured: () => configured(),
}));

const { getVoiceLibrary, getActiveVoices, resolveVoiceRef } = await import("./registry");
const { PROVIDER_VOICE_IDS } = await import("./providerIds");
const { VOICE_SEED } = await import("./catalog");

/** Every seed voice exists in the account. */
const allKnown = () =>
  VOICE_SEED.map((v) => ({ voice_id: PROVIDER_VOICE_IDS[v.slug], name: v.label }));

beforeEach(() => {
  vi.clearAllMocks();
  configFindUnique.mockResolvedValue(null);
  redisGet.mockResolvedValue(null);
  configured.mockReturnValue(true);
  listVoices.mockResolvedValue(allKnown());
});

describe("getVoiceLibrary", () => {
  it("returns the seed when there are no overrides", async () => {
    const all = await getVoiceLibrary();
    expect(all).toHaveLength(VOICE_SEED.length);
  });

  it("lets an admin override a voice without a deploy", async () => {
    configFindUnique.mockResolvedValue({ value: JSON.stringify({ brian: { label: "Narrator" } }) });
    const all = await getVoiceLibrary();
    expect(all.find((v) => v.slug === "brian")?.label).toBe("Narrator");
  });

  it("lets an admin ADD a voice, which is the point of the Config layer", async () => {
    configFindUnique.mockResolvedValue({
      value: JSON.stringify({
        newbie: {
          label: "Newbie", gender: "female", age: "young", languages: ["en"],
          category: "starter", free: true, creditMultiplier: 1,
          providerVoiceIdOverride: "aaaaaaaaaaaaaaaaaaaa",
        },
      }),
    });
    listVoices.mockResolvedValue([...allKnown(), { voice_id: "aaaaaaaaaaaaaaaaaaaa", name: "Newbie" }]);
    const all = await getVoiceLibrary();
    expect(all.find((v) => v.slug === "newbie")?.label).toBe("Newbie");
  });

  it("deactivates a voice the account can no longer speak", async () => {
    // Not deleted: an admin needs to see WHY it vanished from the picker.
    listVoices.mockResolvedValue(allKnown().filter((v) => v.voice_id !== PROVIDER_VOICE_IDS.brian));
    const all = await getVoiceLibrary();
    expect(all.find((v) => v.slug === "brian")?.active).toBe(false);
  });

  it("leaves EVERYTHING enabled when the provider can't be reached", async () => {
    // The load-bearing rule. An outage that emptied the picker would be a worse
    // bug than the one the check exists to prevent.
    listVoices.mockRejectedValue(new Error("network"));
    const all = await getVoiceLibrary();
    // "Everything" means nothing NEWLY disabled. The seed itself ships the
    // retired slugs as inactive, so the assertion is that the sync added none.
    const seedOff = new Set(VOICE_SEED.filter((v) => v.active === false).map((v) => v.slug));
    expect(all.filter((v) => v.active === false).map((v) => v.slug).sort())
      .toEqual([...seedOff].sort());
  });

  it("treats an unusable key the same way — no catalogue, not an empty one", async () => {
    configured.mockReturnValue(false);
    const all = await getVoiceLibrary();
    expect(all).toHaveLength(VOICE_SEED.length);
    expect(listVoices).not.toHaveBeenCalled();
  });

  it("adopts the provider's own preview mp3 for a voice that has none", async () => {
    // Only for voices with no preview of their own — every seeded voice now
    // ships the real ElevenLabs preview URL, and a seeded value must win so a
    // provider blip cannot swap what the picker plays.
    configFindUnique.mockResolvedValue({
      value: JSON.stringify({
        newbie: {
          label: "Newbie", gender: "female", age: "young", languages: ["en"],
          category: "starter", free: true, creditMultiplier: 1,
          providerVoiceIdOverride: "aaaaaaaaaaaaaaaaaaaa",
        },
      }),
    });
    listVoices.mockResolvedValue(
      [...allKnown(), { voice_id: "aaaaaaaaaaaaaaaaaaaa", name: "Newbie" }]
        .map((v) => ({ ...v, preview_url: `https://cdn.invalid/${v.voice_id}.mp3` })),
    );
    const all = await getVoiceLibrary();
    // Free to play, unlike synthesizing a sample on every picker open.
    expect(all.find((v) => v.slug === "newbie")?.previewUrl).toContain("cdn.invalid");
    expect(all.find((v) => v.slug === "brian")?.previewUrl).toContain("elevenlabs.io");
  });
});

describe("getActiveVoices", () => {
  it("hides aliases so one voice is offered once", async () => {
    const shown = await getActiveVoices();
    for (const slug of ["josh", "rachel", "william", "thomas"]) {
      expect(shown.find((v) => v.slug === slug), slug).toBeUndefined();
    }
    for (const slug of ["brian", "sarah", "charlie", "bella"]) {
      expect(shown.find((v) => v.slug === slug), slug).toBeDefined();
    }
  });

  it("orders by sortOrder then label", async () => {
    const shown = await getActiveVoices();
    const orders = shown.map((v) => v.sortOrder ?? 0);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe("resolveVoiceRef", () => {
  it("resolves a slug to the provider id the synthesis call needs", async () => {
    const r = await resolveVoiceRef("brian");
    expect(r).toMatchObject({ slug: "brian", providerVoiceId: PROVIDER_VOICE_IDS.brian, source: "catalog" });
  });

  it("resolves an ALIAS slug, because real projects have one stored", async () => {
    const r = await resolveVoiceRef("josh");
    expect(r.providerVoiceId).toBe(PROVIDER_VOICE_IDS.brian);
  });

  it("passes a raw provider id through, which is what /editor rows hold", async () => {
    const r = await resolveVoiceRef("21m00Tcm4TlvDq8ikWAM");
    expect(r).toMatchObject({ providerVoiceId: "21m00Tcm4TlvDq8ikWAM", source: "raw", creditMultiplier: 1 });
  });

  it("falls back to the default for an empty reference", async () => {
    expect((await resolveVoiceRef("")).slug).toBe("brian");
  });

  it("throws on anything else rather than guessing a voice", async () => {
    // Guessing here means a paid render in somebody else's voice.
    await expect(resolveVoiceRef("not a voice")).rejects.toThrow(/Unknown voice/);
  });

  it("carries the credit multiplier so a paid voice can be billed as one", async () => {
    configFindUnique.mockResolvedValue({ value: JSON.stringify({ william: { creditMultiplier: 3 } }) });
    expect((await resolveVoiceRef("william")).creditMultiplier).toBe(3);
  });
});
