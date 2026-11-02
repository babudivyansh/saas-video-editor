// The server's view of the voice catalogue: code seed + admin overrides +
// provider validation. Mirrors lib/captions/templateRegistry.ts exactly.
//
// Three layers, cheapest first:
//   1. VOICE_SEED + LIBRARY_VOICES — compiled in, always available
//   2. Config key voice_catalog — admin edits, no deploy (Redis-cached 60s)
//   3. getKnownAccountVoices()  — deactivates entries the account cannot speak;
//      getMissingLibraryVoices() does the same for Voice Library voices
//
// Layer 2 is what this catalogue has never had: the voice list was a
// compile-time constant plus 32 env vars, so adding one voice needed a deploy
// while every other routing/pricing lever in this codebase is a Config row.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { VOICE_SEED, DEFAULT_VOICE_SLUG, type VoiceEntry } from "./catalog";
import { LIBRARY_VOICES } from "./library";
import { getMissingLibraryVoices } from "./library-sync";
import { providerVoiceIdFor } from "./providerIds";
import { getKnownAccountVoices } from "./sync";

const CONFIG_KEY = "voice_catalog";
const CACHE_KEY = "admin:voice_catalog";
const CACHE_TTL = 60;

/**
 * Per-slug patches. A slug with no seed default is allowed — that is how a new
 * voice is added without a deploy — but it must then carry everything a voice
 * needs (see isCompleteVoice).
 */
export type VoiceOverrides = Record<string, Partial<VoiceEntry>>;

async function readOverrides(): Promise<VoiceOverrides> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as VoiceOverrides;
  } catch { /* fall through to the DB */ }

  try {
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    const parsed = row ? (JSON.parse(row.value) as VoiceOverrides) : {};
    try { await redis.set(CACHE_KEY, JSON.stringify(parsed), "EX", CACHE_TTL); } catch { /* non-fatal */ }
    return parsed;
  } catch (err) {
    logger.warn("voices", "override config unreadable; using the seed");
    void err;
    return {};
  }
}

export async function invalidateVoiceCache(): Promise<void> {
  try { await redis.del(CACHE_KEY); } catch { /* non-fatal */ }
}

export const getVoiceOverrides = readOverrides;

/**
 * Patches one voice's override (null drops it) and returns the whole map.
 * Read from the DB, not the cache, so two admin edits a few seconds apart
 * don't overwrite each other.
 */
export async function setVoiceOverride(slug: string, patch: Partial<VoiceEntry> | null): Promise<VoiceOverrides> {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
  const map = row ? (JSON.parse(row.value) as VoiceOverrides) : {};
  if (patch) map[slug] = { ...map[slug], ...patch };
  else delete map[slug];
  const value = JSON.stringify(map);
  await prisma.config.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
  await invalidateVoiceCache();
  return map;
}

function isCompleteVoice(p: Partial<VoiceEntry>): p is VoiceEntry {
  return Boolean(p.label && p.gender && p.age && p.languages && p.category);
}

/**
 * The full catalogue, including entries the account can no longer speak (those
 * come back `active: false` rather than being dropped, so an admin can see WHY
 * a voice vanished from the picker).
 */
export async function getVoiceLibrary(): Promise<VoiceEntry[]> {
  const overrides = await readOverrides();

  const bySlug = new Map<string, VoiceEntry>();
  for (const v of [...VOICE_SEED, ...LIBRARY_VOICES]) bySlug.set(v.slug, v);
  for (const [slug, patch] of Object.entries(overrides)) {
    const base = bySlug.get(slug);
    if (base) bySlug.set(slug, { ...base, ...patch, slug });
    else if (isCompleteVoice(patch)) bySlug.set(slug, { ...patch, slug });
  }

  const all = [...bySlug.values()];
  const [known, missing] = await Promise.all([getKnownAccountVoices(), getMissingLibraryVoices()]);

  return all.map((v) => {
    // A library voice isn't on the account until its first use, so the
    // account list can't vouch for it; the nightly library sync can.
    if (v.category === "library" && !v.providerVoiceIdOverride) return missing.has(v.slug) ? { ...v, active: false } : v;
    // null = could not check. Leave everything enabled; see sync.ts.
    if (!known) return v;
    const providerId = providerVoiceIdFor(v.slug) ?? v.providerVoiceIdOverride;
    // No id at all means an override added a slug without one — it can never
    // synthesize, so it must not be offered.
    if (!providerId) return { ...v, active: false };
    const hit = known.get(providerId);
    if (!hit) return { ...v, active: false };
    // The provider's own preview mp3 is free to play, so prefer it over
    // synthesizing a sample every time a picker opens.
    return v.previewUrl || !hit.previewUrl ? v : { ...v, previewUrl: hit.previewUrl };
  });
}

/**
 * What a picker shows: active, de-aliased, in sortOrder then label order.
 *
 * Aliases are hidden rather than deleted — four seed slugs resolve to the same
 * provider voice as another (dandan/josh, charlie/sam, natasha/rachel,
 * bella/sarah) and those slugs are persisted on real projects, so they must
 * keep resolving even though showing the same voice twice was always a bug.
 */
export async function getActiveVoices(): Promise<VoiceEntry[]> {
  const all = await getVoiceLibrary();
  return all
    .filter((v) => v.active !== false && !v.aliasOf)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label));
}

export interface ResolvedVoice {
  providerVoiceId: string;
  slug: string;
  creditMultiplier: number;
  /** "catalog" = a known slug; "raw" = a provider id we were handed directly. */
  source: "catalog" | "raw";
}

/** A bare provider id: ElevenLabs ids are 20 URL-safe characters. */
const RAW_PROVIDER_ID = /^[A-Za-z0-9]{20}$/;

/**
 * Resolves whatever is stored in Project.voiceId — a slug OR a raw provider id.
 *
 * Both forms exist in production: the create pages persist slugs, while the
 * legacy /editor wizard persisted raw ids. Accepting both is what makes a
 * backfill unnecessary, which matters because those ids cannot currently be
 * validated against the provider at all.
 *
 * Throws on anything else rather than guessing — a wrong voice is a paid
 * render in someone else's voice.
 */
export async function resolveVoiceRef(ref: string): Promise<ResolvedVoice> {
  const trimmed = (ref || "").trim();
  if (!trimmed) {
    const fallback = await resolveVoiceRef(DEFAULT_VOICE_SLUG);
    return fallback;
  }

  const all = await getVoiceLibrary();
  const hit = all.find((v) => v.slug === trimmed);
  const providerId = hit ? providerVoiceIdFor(hit.slug) ?? hit.providerVoiceIdOverride : undefined;
  if (hit && providerId) {
    return {
      providerVoiceId: providerId,
      slug: hit.slug,
      creditMultiplier: hit.creditMultiplier ?? 1,
      source: "catalog",
    };
  }

  if (RAW_PROVIDER_ID.test(trimmed)) {
    // A cloned voice, a Voice Library voice, or a legacy /editor row. We cannot
    // price a multiplier we have never seen, so it bills as 1x — the library
    // path stores the real multiplier on its own row instead.
    return { providerVoiceId: trimmed, slug: trimmed, creditMultiplier: 1, source: "raw" };
  }

  throw new Error(`Unknown voice "${trimmed.slice(0, 40)}"`);
}

/**
 * A voice a tool request may use on this user's behalf: any catalogue voice,
 * or the raw provider id of a voice THIS user cloned (the mobile app sends
 * those). Null for anything else — resolveVoiceRef alone lets any 20-character
 * id through, which let a request use any voice on our ElevenLabs account
 * (including other people's clones) and put arbitrary text into the provider
 * URL (2026-10-14 tools audit).
 */
export async function resolveToolVoice(userId: string, ref: string): Promise<ResolvedVoice | null> {
  const voice = await resolveVoiceRef(ref).catch(() => null);
  if (!voice) return null;
  if (voice.source === "catalog") return voice;
  const own = await prisma.clonedVoice.findFirst({
    where: { userId, elevenLabsVoiceId: voice.providerVoiceId },
    select: { id: true },
  });
  return own ? voice : null;
}
