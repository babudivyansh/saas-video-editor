// @vitest-environment node
//
// The anti-regression test for the six-list consolidation.
//
// Every slug that any of the old lists could produce is frozen below. Those
// values are persisted in Project.voiceId on real projects, so a slug that
// stops resolving does not fail loudly — it silently re-voices someone's video
// in the fallback voice on the next render.
import { describe, it, expect } from "vitest";
import { VOICE_SEED, VOICE_BY_SLUG, DEFAULT_VOICE_SLUG, MULTILINGUAL } from "./catalog";
import { VOICE_ID_MAP, resolveVoiceId } from "@/utils/voice-ids";
import { PROVIDER_VOICE_IDS } from "./providerIds";
import { readFileSync } from "node:fs";

/** Union of all six pre-consolidation lists, captured before they were deleted. */
const LEGACY_SLUGS = [
  // utils/voice-ids.ts VOICE_ID_MAP
  "william", "adam", "dandan", "charlie", "clyde", "daniel", "dave", "ethan",
  "fin", "harry", "josh", "liam", "matthew", "patrick", "sam", "thomas",
  "natasha", "alice", "aria", "bella", "charlotte", "elli", "emily", "freya",
  "grace", "matilda", "rachel", "sarah", "serena", "amir1", "amir2", "spongebob",
];

/** The five raw provider ids app/editor/page.tsx used, which had no slug at all. */
const LEGACY_RAW_IDS = [
  "21m00Tcm4TlvDq8ikWAM", // Rachel
  "AZnzlk1XvdvUeBnXmlld", // Domi
  "EXAVITQu4vr4xnSDxMaL", // Bella
  "ErXwobaYiN019PkySvjV", // Antoni
  "MF3mGyEYCl7XYWbV9V6O", // Elli
];

describe("the voice seed", () => {
  it("still resolves every slug the six old lists could produce", () => {
    for (const slug of LEGACY_SLUGS) {
      expect(VOICE_BY_SLUG[slug], `slug "${slug}" no longer resolves`).toBeDefined();
      expect(resolveVoiceId(slug)).toMatch(/^[A-Za-z0-9]{20}$/);
    }
  });

  it("passes a raw provider id straight through", () => {
    // The legacy editor stored these instead of slugs. The fallthrough in
    // resolveVoiceId is the only reason those projects still speak.
    for (const id of LEGACY_RAW_IDS) expect(resolveVoiceId(id)).toBe(id);
  });

  it("derives VOICE_ID_MAP from the seed rather than repeating it", () => {
    expect(Object.keys(VOICE_ID_MAP).sort()).toEqual(VOICE_SEED.map((v) => v.slug).sort());
  });

  it("keeps every retired slug resolving, pointed at a live voice", () => {
    // ElevenLabs retired 24 of the 32 voices the old lists shipped. Those
    // slugs are persisted in Project.voiceId rows, so they cannot simply be
    // deleted — each is kept as an alias of the nearest surviving voice and
    // hidden from pickers. This asserts the property, not the pairing: which
    // voice a retired slug maps to is a judgement call, but EVERY alias must
    // point at a slug that exists and is itself not an alias.
    const aliases = VOICE_SEED.filter((v) => v.aliasOf);
    expect(aliases.length).toBeGreaterThan(0);
    for (const v of aliases) {
      const target = VOICE_SEED.find((t) => t.slug === v.aliasOf);
      expect(target, `${v.slug} -> ${v.aliasOf}`).toBeDefined();
      expect(target!.aliasOf, `${v.aliasOf} must not itself be an alias`).toBeUndefined();
      // Hidden, not deleted.
      expect(v.active).toBe(false);
    }
  });

  it("still carries every slug the six old lists could have stored", () => {
    // The anti-regression test for the whole consolidation: a slug missing
    // here is a project that renders with the wrong voice, or none.
    const OLD = [
      "adam", "alice", "amir1", "amir2", "aria", "bella", "charlie", "charlotte",
      "clyde", "dandan", "daniel", "dave", "elli", "emily", "ethan", "fin",
      "freya", "grace", "harry", "josh", "liam", "matilda", "matthew", "natasha",
      "patrick", "rachel", "sam", "sarah", "serena", "spongebob", "thomas",
      "william",
    ];
    const have = new Set(VOICE_SEED.map((v) => v.slug));
    expect(OLD.filter((s) => !have.has(s))).toEqual([]);
  });

  it("gives every alias the same provider voice as its canonical slug", () => {
    for (const v of VOICE_SEED) {
      if (!v.aliasOf) continue;
      expect(PROVIDER_VOICE_IDS[v.aliasOf]).toBe(PROVIDER_VOICE_IDS[v.slug]);
    }
  });

  it("has no duplicate provider ids left once aliases are excluded", () => {
    const ids = VOICE_SEED.filter((v) => !v.aliasOf).map((v) => PROVIDER_VOICE_IDS[v.slug]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps provider ids OUT of the client-safe catalogue", () => {
    // catalog.ts is compiled into the browser bundle as the picker's offline
    // fallback, and /api/voices strips the provider id from every response so
    // the id that routes a paid call never reaches a client. Leaving the ids in
    // this file would hand them over anyway, silently undoing that.
    const src = readFileSync("lib/voices/catalog.ts", "utf8");
    // A bare 20-char alphanumeric inside quotes is what a provider id looks
    // like; identifiers of that length in the source are not.
    expect(src).not.toMatch(/"[A-Za-z0-9]{20}"/);
    expect(src).not.toContain("@/lib/env");
  });

  it("gives every entry what the picker and the renderer need", () => {
    for (const v of VOICE_SEED) {
      expect(PROVIDER_VOICE_IDS[v.slug], v.slug).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(v.label, v.slug).toBeTruthy();
      expect(v.languages.length, v.slug).toBeGreaterThan(0);
      expect(v.creditMultiplier, v.slug).toBeGreaterThanOrEqual(1);
    }
  });

  it("defaults to a voice that exists", () => {
    expect(VOICE_BY_SLUG[DEFAULT_VOICE_SLUG]).toBeDefined();
  });

  it("uses BCP-47 codes the language filter can match", () => {
    for (const code of MULTILINGUAL) expect(code).toMatch(/^[a-z]{2,3}$/);
  });
});
