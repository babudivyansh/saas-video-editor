// Keeps the Voice Library voices honest.
//
// A library voice belongs to someone else, who can withdraw it (the curation
// only takes voices with a year's notice, scripts/voices/curate-library.mjs).
// It is not on the account until first used, so the account-voice check in
// lib/voices/sync.ts can't vouch for it — that check would hide all 200.
//
// Instead this runs nightly: GET /v1/voices/{id} for each one, and the slugs
// ElevenLabs answers "not found" for go into the `voice_library_missing` Config
// row. The registry hides those. Only a definite 4xx counts — a 429 or 5xx
// leaves a voice as it was, for the same reason sync.ts returns null on
// failure: a provider outage must never empty the picker.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { isElevenLabsConfigured } from "@/utils/elevenlabs";
import { LIBRARY_PROVIDER_IDS } from "./libraryProviderIds";

const CONFIG_KEY = "voice_library_missing";
const CACHE_KEY = "admin:voice_library_missing";
const CACHE_TTL = 60;

/** Slugs of library voices ElevenLabs no longer has. Empty when unknown. */
export async function getMissingLibraryVoices(): Promise<Set<string>> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return new Set(JSON.parse(cached) as string[]);
  } catch { /* fall through to the DB */ }
  try {
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    const slugs = row ? (JSON.parse(row.value) as string[]) : [];
    try { await redis.set(CACHE_KEY, JSON.stringify(slugs), "EX", CACHE_TTL); } catch { /* non-fatal */ }
    return new Set(slugs);
  } catch {
    return new Set();
  }
}

type Probe = "ok" | "gone" | "unknown";

async function probe(voiceId: string): Promise<Probe> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY! },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return "ok";
    // 400 is what ElevenLabs answers for a voice id it doesn't know.
    return res.status === 400 || res.status === 404 ? "gone" : "unknown";
  } catch {
    return "unknown";
  }
}

export interface LibrarySyncResult {
  checked: number;
  missing: string[];
  unknown: number;
  skipped?: string;
}

export async function runLibrarySync(): Promise<LibrarySyncResult> {
  if (!isElevenLabsConfigured()) return { checked: 0, missing: [], unknown: 0, skipped: "ElevenLabs is not configured" };

  const before = await getMissingLibraryVoices();
  const entries = Object.entries(LIBRARY_PROVIDER_IDS);
  const missing = new Set<string>();
  let unknown = 0;

  // Five at a time: 200 voices in well under a minute, without a burst that
  // trips the account's rate limit.
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const results = await Promise.all(batch.map(([, id]) => probe(id)));
    batch.forEach(([slug], j) => {
      if (results[j] === "gone") missing.add(slug);
      // Couldn't tell: keep yesterday's answer for this one.
      else if (results[j] === "unknown") { unknown++; if (before.has(slug)) missing.add(slug); }
    });
  }

  const list = [...missing].sort();
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(list) },
    update: { value: JSON.stringify(list) },
  });
  try { await redis.del(CACHE_KEY); } catch { /* non-fatal */ }

  const added = list.filter((s) => !before.has(s));
  if (added.length) logger.warn("voices", `library voices withdrawn: ${added.join(", ")}`);
  return { checked: entries.length, missing: list, unknown };
}
