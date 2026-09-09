// Slug → provider voice id.
//
// The table itself now lives in lib/voices/catalog.ts (VOICE_SEED), which is
// also what the pickers and the server registry read. This file stays because
// `resolveVoiceId` is called from a dozen synthesis paths and its behaviour —
// especially the raw-id passthrough below — is depended on by real data.
//
// Prefer `resolveVoiceRef` (lib/voices/registry.ts) in new code: it honours
// admin overrides and returns the credit multiplier a paid voice needs. This
// synchronous version cannot do either, because it never touches the DB.

import { PROVIDER_VOICE_IDS } from "@/lib/voices/providerIds";

/**
 * Slug → provider voice id, derived from the one catalogue.
 *
 * Was a hand-maintained 32-entry literal that had drifted from the five picker
 * lists that displayed it — including four pairs of slugs pointing at the SAME
 * provider voice (dandan/josh, charlie/sam, natasha/rachel, bella/sarah), which
 * is why the product offered 32 voices but could only speak in 28.
 */
export const VOICE_ID_MAP: Record<string, string> = PROVIDER_VOICE_IDS;

/**
 * Resolves a stored voice reference to something the provider accepts.
 *
 * The fallthrough is load-bearing, not laziness: cloned voices, Voice Library
 * voices and the legacy /editor wizard's rows all store a RAW provider id with
 * no slug, and returning it unchanged is the only reason those still play.
 */
export function resolveVoiceId(slug: string): string {
  return VOICE_ID_MAP[slug] ?? slug;
}
