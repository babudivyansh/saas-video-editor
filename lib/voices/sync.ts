// Validates the voice catalogue against the account's real voices.
//
// Same job, same rules, as lib/captions/templateSync.ts: a slug whose provider
// voice no longer exists in the account must stop being offered, because the
// alternative is a synthesis call that fails after the user has been charged.
//
// The null contract is the important part and is copied deliberately:
//
//   Map  -> "these are the voices that exist"; anything not in it is gone.
//   null -> "could not check"; leave EVERYTHING enabled.
//
// A provider outage must never empty the picker. Returning an empty Map on
// failure would do exactly that, which is why failure returns null instead.

import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { listVoices, isElevenLabsConfigured } from "@/utils/elevenlabs";

const CACHE_KEY = "elevenlabs:account-voices";
/** Six hours. Opening a picker must never cost a provider call. */
const CACHE_TTL = 6 * 60 * 60;

export interface KnownVoice {
  name: string;
  previewUrl?: string;
}

/**
 * The provider voice ids this account can actually synthesize with, keyed by
 * id. Null when the provider could not be reached or is not configured.
 */
export async function getKnownAccountVoices(): Promise<Map<string, KnownVoice> | null> {
  if (!isElevenLabsConfigured()) return null;

  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Record<string, KnownVoice>;
      return new Map(Object.entries(parsed));
    }
  } catch { /* fall through to a live read */ }

  try {
    const voices = await listVoices();
    const byId: Record<string, KnownVoice> = {};
    for (const v of voices) {
      byId[v.voice_id] = { name: v.name, ...(v.preview_url ? { previewUrl: v.preview_url } : {}) };
    }
    // An empty account is a real answer, but it is indistinguishable from a
    // half-failed read, and acting on it would deactivate every voice at once.
    if (Object.keys(byId).length === 0) return null;

    try { await redis.set(CACHE_KEY, JSON.stringify(byId), "EX", CACHE_TTL); } catch { /* non-fatal */ }
    return new Map(Object.entries(byId));
  } catch (err) {
    logger.warn("voices", "could not read account voices; leaving the catalogue enabled");
    void err;
    return null;
  }
}

export async function invalidateAccountVoiceCache(): Promise<void> {
  try { await redis.del(CACHE_KEY); } catch { /* non-fatal */ }
}
